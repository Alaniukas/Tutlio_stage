import type { SupabaseClient } from '@supabase/supabase-js';
import { findAuthUserByEmail } from './findAuthUserByEmail.js';
import {
  schoolFamilyAccountsSetupEnabled,
  schoolFamilyPortalEnabled,
} from './schoolFamilyGuardianAccess.js';
import { bindSchoolFamilyGuardianForRegisteredParent } from './schoolFamilyAccounts.js';

type OrgRow = { entity_type: string | null; features: Record<string, unknown> | null };
type StudentRow = {
  id: string;
  organization_id: string | null;
  parent_user_id: string | null;
  payer_email: string | null;
  parent_secondary_email: string | null;
  detached_at: string | null;
  enrollment_status: string | null;
};

export function payerEmailMatches(student: Pick<StudentRow, 'payer_email' | 'parent_secondary_email'>, email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return [student.payer_email, student.parent_secondary_email]
    .some((value) => String(value || '').trim().toLowerCase() === normalized);
}

export async function loadSchoolOrganization(
  db: SupabaseClient,
  orgId: string | null,
): Promise<OrgRow | null> {
  if (!orgId) return null;
  const { data, error } = await db.from('organizations').select('entity_type, features').eq('id', orgId).maybeSingle();
  if (error) throw error;
  return data as OrgRow | null;
}

export function schoolAutoLinkSiblingsEnabled(entityType: string | null | undefined): boolean {
  return entityType === 'school';
}

export function schoolFamilyAccessEnabled(features: Record<string, unknown> | null | undefined): boolean {
  return schoolFamilyPortalEnabled(features) || schoolFamilyAccountsSetupEnabled(features);
}

export async function listActiveSchoolStudentsByPayerEmail(
  db: SupabaseClient,
  orgId: string,
  payerEmail: string,
): Promise<Array<{ id: string; parent_user_id: string | null }>> {
  const { data, error } = await db
    .from('students')
    .select('id, parent_user_id, payer_email, parent_secondary_email, enrollment_status, detached_at')
    .eq('organization_id', orgId)
    .eq('enrollment_status', 'active')
    .is('detached_at', null);
  if (error) throw error;
  return (data as StudentRow[] || [])
    .filter((row) => payerEmailMatches(row, payerEmail))
    .map((row) => ({ id: row.id, parent_user_id: row.parent_user_id }));
}

export async function syncParentChatParticipants(
  db: SupabaseClient,
  userId: string,
  studentId: string,
): Promise<void> {
  const { data: student } = await db.from('students').select('linked_user_id').eq('id', studentId).maybeSingle();
  const linkedUid = student?.linked_user_id as string | null | undefined;
  if (!linkedUid) return;

  const { data: parts } = await db.from('chat_participants').select('conversation_id').eq('user_id', linkedUid);
  const convIds = [...new Set((parts ?? []).map((row: { conversation_id: string }) => row.conversation_id))];
  for (const conversation_id of convIds) {
    const { error } = await db.from('chat_participants').upsert(
      {
        conversation_id,
        user_id: userId,
        last_read_at: new Date().toISOString(),
        email_notify_enabled: true,
        email_notify_delay_hours: 12,
      },
      { onConflict: 'conversation_id,user_id' },
    );
    if (error) throw error;
  }
}

export async function upsertParentStudentLink(
  db: SupabaseClient,
  parentProfileId: string,
  userId: string,
  studentId: string,
  options: {
    childInfo?: { child_birth_date?: string; grade?: string };
    setParentUserId?: boolean;
  } = {},
): Promise<void> {
  const { error: psErr } = await db.from('parent_students').upsert(
    { parent_id: parentProfileId, student_id: studentId },
    { onConflict: 'parent_id,student_id' },
  );
  if (psErr) throw psErr;

  const studentUpdate: Record<string, unknown> = {};
  if (options.setParentUserId !== false) studentUpdate.parent_user_id = userId;
  if (options.childInfo?.child_birth_date) studentUpdate.child_birth_date = options.childInfo.child_birth_date;
  if (options.childInfo?.grade) studentUpdate.grade = options.childInfo.grade;
  if (Object.keys(studentUpdate).length > 0) {
    const { error: studentErr } = await db.from('students').update(studentUpdate).eq('id', studentId);
    if (studentErr) throw studentErr;
  }

  await syncParentChatParticipants(db, userId, studentId);
}

async function studentOrganizationId(
  db: SupabaseClient,
  student: { organization_id?: string | null; tutor_id?: string | null },
): Promise<string | null> {
  if (student.organization_id) return student.organization_id;
  if (!student.tutor_id) return null;
  const { data: tutorRow, error } = await db
    .from('profiles')
    .select('organization_id')
    .eq('id', student.tutor_id)
    .maybeSingle();
  if (error) throw error;
  return tutorRow?.organization_id || null;
}

export async function linkSchoolParentToStudentIds(
  db: SupabaseClient,
  opts: {
    orgId: string;
    orgFeatures: Record<string, unknown> | null;
    parentProfileId: string;
    userId: string;
    parentEmail: string;
    studentIds: string[];
    primaryStudentId: string;
    childInfo?: { child_birth_date?: string; grade?: string };
  },
): Promise<string[]> {
  const linked: string[] = [];
  const portalFamily = schoolFamilyAccessEnabled(opts.orgFeatures);
  for (const studentId of [...new Set(opts.studentIds)]) {
    await upsertParentStudentLink(
      db,
      opts.parentProfileId,
      opts.userId,
      studentId,
      {
        childInfo: studentId === opts.primaryStudentId ? opts.childInfo : undefined,
        setParentUserId: true,
      },
    );
    if (portalFamily) {
      await bindSchoolFamilyGuardianForRegisteredParent(db, opts.orgId, studentId, opts.userId, opts.parentEmail);
    }
    linked.push(studentId);
  }
  return linked;
}

export async function markParentInvitesUsed(
  db: SupabaseClient,
  inviteIds: string[],
): Promise<void> {
  if (!inviteIds.length) return;
  const { error } = await db.from('parent_invites').update({ used: true }).in('id', inviteIds);
  if (error) throw error;
}

export async function unusedInviteIdsForEmail(
  db: SupabaseClient,
  parentEmail: string,
  studentIds: string[],
): Promise<string[]> {
  if (!studentIds.length) return [];
  const { data, error } = await db
    .from('parent_invites')
    .select('id, student_id, parent_email')
    .in('student_id', studentIds)
    .eq('used', false);
  if (error) throw error;
  const normalized = parentEmail.trim().toLowerCase();
  return (data || [])
    .filter((row) => String(row.parent_email || '').trim().toLowerCase() === normalized)
    .map((row) => row.id as string);
}

export async function linkExistingSchoolParentByEmail(
  db: SupabaseClient,
  studentId: string,
  parentEmail: string,
): Promise<{ linked: boolean; studentIds: string[]; reason?: string }> {
  const trimmedEmail = parentEmail.trim().toLowerCase();
  if (!trimmedEmail.includes('@')) return { linked: false, studentIds: [], reason: 'invalid_email' };

  const auth = await findAuthUserByEmail(db, trimmedEmail);
  if (!auth?.id) return { linked: false, studentIds: [], reason: 'not_registered' };

  const { data: profile, error: profileErr } = await db
    .from('parent_profiles')
    .select('id, user_id, email')
    .eq('user_id', auth.id)
    .maybeSingle();
  if (profileErr) throw profileErr;
  if (!profile?.id) return { linked: false, studentIds: [], reason: 'not_registered' };

  const { data: anchor, error: anchorErr } = await db
    .from('students')
    .select('id, organization_id, tutor_id, detached_at, enrollment_status')
    .eq('id', studentId)
    .maybeSingle();
  if (anchorErr) throw anchorErr;
  if (!anchor || anchor.detached_at || anchor.enrollment_status !== 'active') {
    return { linked: false, studentIds: [], reason: 'student_not_active' };
  }

  const orgId = await studentOrganizationId(db, anchor);
  if (!orgId) return { linked: false, studentIds: [], reason: 'organization_missing' };
  const org = await loadSchoolOrganization(db, orgId);
  if (!schoolAutoLinkSiblingsEnabled(org?.entity_type)) {
    return { linked: false, studentIds: [], reason: 'not_school' };
  }

  const siblings = await listActiveSchoolStudentsByPayerEmail(db, orgId, trimmedEmail);
  const studentIds = siblings.map((row) => row.id);
  if (!studentIds.includes(studentId)) studentIds.push(studentId);

  const linkedStudentIds = await linkSchoolParentToStudentIds(db, {
    orgId,
    orgFeatures: org?.features ?? null,
    parentProfileId: profile.id,
    userId: auth.id,
    parentEmail: trimmedEmail,
    studentIds,
    primaryStudentId: studentId,
  });

  const inviteIds = await unusedInviteIdsForEmail(db, trimmedEmail, linkedStudentIds);
  await markParentInvitesUsed(db, inviteIds);

  return { linked: true, studentIds: linkedStudentIds };
}
