import type { SupabaseClient } from '@supabase/supabase-js';
import { attachSchoolGroupMinimumStatus } from './schoolGroupMinimumPolicy.js';
import { contractSigningSettings } from './schoolContractSigning.js';
import { hasOrgAdminPermission, type OrgAdminRole } from '../../src/lib/orgAdminPermissions.js';
import {
  evaluateSchoolGroupMinimumRisk,
  schoolGroupMinimumRiskOccurrenceKey,
  type SchoolGroupAtRiskInput,
} from '../../src/lib/schoolGroupMinimumAtRisk.js';

type GroupRow = SchoolGroupAtRiskInput & {
  organization_id: string;
  minimum_risk_warning_occurrence_at?: string | null;
  members?: Array<{ student_id?: string | null }>;
  tutor?: { full_name?: string | null; email?: string | null } | null;
};

function relatedOne<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export function orgHasSchoolClassGroups(features: unknown): boolean {
  return features && typeof features === 'object' && !Array.isArray(features)
    && (features as Record<string, unknown>).school_class_groups === true;
}

export async function loadSchoolGroupMinimumRiskCandidates(
  supabase: SupabaseClient,
  organizationId: string,
  options?: { tutorId?: string | null },
): Promise<GroupRow[]> {
  let query = supabase
    .from('school_class_groups')
    .select(`
      id,
      organization_id,
      name,
      tutor_id,
      duration_minutes,
      minimum_active_students,
      minimum_risk_warning_occurrence_at,
      suspension_started_at,
      suspension_until,
      suspension_resumed_at,
      tutor:profiles!school_class_groups_tutor_id_fkey(full_name, email),
      slots:school_class_group_slots(weekday, start_time, end_time),
      members:school_class_group_members(student_id)
    `)
    .eq('organization_id', organizationId)
    .is('suspension_resumed_at', null);
  if (options?.tutorId) query = query.eq('tutor_id', options.tutorId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const groups = (data || []).map((row: any) => ({
    ...row,
    tutor: relatedOne(row.tutor),
    slots: row.slots || [],
    members: row.members || [],
  })) as GroupRow[];
  const withStatus = await attachSchoolGroupMinimumStatus(
    supabase,
    organizationId,
    groups.map((group) => ({
      id: group.id,
      members: (group.members || [])
        .filter((member): member is { student_id: string } => Boolean(member.student_id))
        .map((member) => ({ student_id: member.student_id })),
    })),
  );
  const statusById = new Map(withStatus.map((group) => [group.id, group.minimum_status]));
  return groups.map((group) => ({
    ...group,
    minimum_status: statusById.get(group.id),
    tutor_name: group.tutor?.full_name || null,
  }));
}

export async function getSchoolOrgNotifyEmails(
  supabase: SupabaseClient,
  organizationId: string,
  org: { email?: string | null; features?: unknown },
): Promise<string[]> {
  const settings = contractSigningSettings({ organizations: org });
  const emails = new Set<string>();
  if (settings.email) emails.add(settings.email);

  const orgAdminResult = await supabase
    .from('organization_admins')
    .select('user_id, role, status, permissions, accepted_at')
    .eq('organization_id', organizationId);
  let orgAdmins = orgAdminResult.data || [];
  if (orgAdminResult.error?.code === '42703' || orgAdminResult.error?.code === 'PGRST204') {
    const legacy = await supabase
      .from('organization_admins')
      .select('user_id')
      .eq('organization_id', organizationId);
    orgAdmins = (legacy.data || []).map((row: { user_id: string }) => ({
      ...row,
      role: 'owner',
      status: 'active',
      permissions: {},
      accepted_at: new Date(0).toISOString(),
    }));
  }
  const adminIds = orgAdmins
    .filter((row: any) => (
      row.status === 'active'
      && Boolean(row.accepted_at)
      && hasOrgAdminPermission(row.role as OrgAdminRole, row.permissions, 'sessions.view')
    ))
    .map((row: any) => row.user_id)
    .filter(Boolean);
  if (adminIds.length > 0) {
    const { data: adminProfiles } = await supabase
      .from('profiles')
      .select('email')
      .in('id', adminIds);
    for (const profile of adminProfiles || []) {
      const email = String((profile as { email?: string }).email || '').trim();
      if (email) emails.add(email);
    }
  }
  return [...emails];
}

export function formatSchoolGroupOccurrenceLt(value: Date): string {
  return value.toLocaleString('lt-LT', {
    timeZone: 'Europe/Vilnius',
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function sendSchoolGroupMinimumRiskEmail(
  appOrigin: string,
  to: string,
  data: Record<string, unknown>,
): Promise<boolean> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || !to) return false;
  try {
    const response = await fetch(`${appOrigin.replace(/\/$/, '')}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': serviceKey },
      body: JSON.stringify({
        type: 'school_group_minimum_risk_warning',
        to,
        data,
        locale: 'lt',
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export type SchoolGroupMinimumWarningRunResult = {
  scanned: number;
  atRisk: number;
  emailed: number;
  skippedAlreadySent: number;
};

export async function runSchoolGroupMinimumWarnings(
  supabase: SupabaseClient,
  appOrigin: string,
  now = new Date(),
): Promise<SchoolGroupMinimumWarningRunResult> {
  const { data: orgs, error } = await supabase
    .from('organizations')
    .select('id, name, email, features, preferred_locale, entity_type')
    .eq('entity_type', 'school');
  if (error) throw new Error(error.message);

  let scanned = 0;
  let atRisk = 0;
  let emailed = 0;
  let skippedAlreadySent = 0;
  const groupsUrl = `${appOrigin.replace(/\/$/, '')}/school/groups`;
  const calendarUrl = `${appOrigin.replace(/\/$/, '')}/calendar`;

  for (const org of orgs || []) {
    if (!orgHasSchoolClassGroups(org.features)) continue;
    const groups = await loadSchoolGroupMinimumRiskCandidates(supabase, org.id);
    scanned += groups.length;
    const notifyEmails = await getSchoolOrgNotifyEmails(supabase, org.id, org);
    for (const group of groups) {
      const risk = evaluateSchoolGroupMinimumRisk(group, now);
      if (!risk.atRisk || !risk.occurrenceStart) continue;
      atRisk += 1;
      const occurrenceKey = schoolGroupMinimumRiskOccurrenceKey(risk.occurrenceStart);
      const sentFor = schoolGroupMinimumRiskOccurrenceKey(group.minimum_risk_warning_occurrence_at);
      if (occurrenceKey && sentFor === occurrenceKey) {
        skippedAlreadySent += 1;
        continue;
      }
      const occurrenceLabel = formatSchoolGroupOccurrenceLt(risk.occurrenceStart);
      const payload = {
        organizationId: org.id,
        schoolName: org.name || '',
        groupName: group.name,
        tutorName: group.tutor_name || group.tutor?.full_name || '',
        eligibleCount: risk.eligibleCount,
        minimumStudentCount: risk.minimum,
        occurrenceLabel,
        groupsUrl,
        calendarUrl,
      };
      const recipients = new Set<string>();
      const tutorEmail = String(group.tutor?.email || '').trim();
      if (tutorEmail) recipients.add(tutorEmail);
      for (const email of notifyEmails) recipients.add(email);

      let sentAny = false;
      for (const email of recipients) {
        const ok = await sendSchoolGroupMinimumRiskEmail(appOrigin, email, {
          ...payload,
          recipientEmail: email,
          isTutorRecipient: email === tutorEmail,
        });
        if (ok) {
          sentAny = true;
          emailed += 1;
        }
      }
      if (sentAny && occurrenceKey) {
        const { error: stampError } = await supabase
          .from('school_class_groups')
          .update({ minimum_risk_warning_occurrence_at: occurrenceKey })
          .eq('id', group.id)
          .eq('organization_id', org.id);
        if (stampError) throw new Error(stampError.message);
      }
    }
  }

  return { scanned, atRisk, emailed, skippedAlreadySent };
}
