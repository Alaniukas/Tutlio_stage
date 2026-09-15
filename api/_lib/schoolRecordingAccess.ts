import type { SupabaseClient } from '@supabase/supabase-js';
import { getOrgAdminAccessByUserId } from './orgAdminAccess.js';
import { hasOrgAdminPermission } from '../../src/lib/orgAdminPermissions.js';

export interface RecordingViewerGroup {
  id: string;
  organizationId: string;
  name: string;
  tutorId: string | null;
}

export interface RecordingViewerAccess {
  groups: RecordingViewerGroup[];
  organizationIds: string[];
  canManage: boolean;
  isAdmin: boolean;
  isTutor: boolean;
  isStudentOrParent: boolean;
}

type GroupRow = {
  id: string;
  organization_id: string;
  name: string;
  tutor_id: string | null;
};

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

async function viewerEmails(
  supabase: SupabaseClient,
  userId: string,
  parentEmail: string | null | undefined,
): Promise<string[]> {
  const emails = new Set<string>();
  const fromProfile = String(parentEmail || '').trim().toLowerCase();
  if (fromProfile.includes('@')) emails.add(fromProfile);
  try {
    const authApi = (supabase as { auth?: { admin?: { getUserById?: (id: string) => Promise<{ data?: { user?: { email?: string | null } | null } | null }> } } }).auth?.admin;
    const result = await authApi?.getUserById?.(userId);
    const fromAuth = String(result?.data?.user?.email || '').trim().toLowerCase();
    if (fromAuth.includes('@')) emails.add(fromAuth);
  } catch {
    /* tests and environments without Auth admin stay on parent_profiles.email */
  }
  return [...emails];
}

async function recordingStudentIds(
  supabase: SupabaseClient,
  userId: string,
  requestedStudentId?: string,
): Promise<string[]> {
  const [{ data: direct, error: directError }, { data: parentProfile, error: parentError }] = await Promise.all([
    supabase
      .from('students')
      .select('id')
      .or(`linked_user_id.eq.${userId},parent_user_id.eq.${userId}`),
    supabase.from('parent_profiles').select('id, email').eq('user_id', userId).maybeSingle(),
  ]);
  if (directError || parentError) throw directError || parentError;

  let parentStudentIds: string[] = [];
  if (parentProfile?.id) {
    const { data, error } = await supabase
      .from('parent_students')
      .select('student_id')
      .eq('parent_id', parentProfile.id);
    if (error) throw error;
    parentStudentIds = (data || []).map((row: { student_id: string }) => row.student_id);
  }

  const emails = await viewerEmails(supabase, userId, (parentProfile as { email?: string | null } | null)?.email);
  let payerStudentIds: string[] = [];
  if (emails.length) {
    const orFilter = emails
      .flatMap((email) => {
        const quoted = `"${email.replace(/"/g, '')}"`;
        return [`payer_email.ilike.${quoted}`, `parent_secondary_email.ilike.${quoted}`];
      })
      .join(',');
    const { data, error } = await supabase
      .from('students')
      .select('id')
      .or(orFilter);
    if (error) throw error;
    payerStudentIds = (data || []).map((row: { id: string }) => row.id);
  }

  const allowed = uniqueStrings([
    ...(direct || []).map((row: { id: string }) => row.id),
    ...parentStudentIds,
    ...payerStudentIds,
  ]);
  if (!requestedStudentId) return allowed;
  return allowed.includes(requestedStudentId) ? [requestedStudentId] : [];
}

async function groupRowsForViewer(
  supabase: SupabaseClient,
  params: {
    adminOrgId?: string | null;
    tutorId?: string | null;
    studentIds: string[];
  },
): Promise<GroupRow[]> {
  const queries: Array<PromiseLike<{ data: unknown; error: { message?: string } | null }>> = [];
  if (params.adminOrgId) {
    queries.push(
      supabase.from('school_class_groups')
        .select('id, organization_id, name, tutor_id')
        .eq('organization_id', params.adminOrgId),
    );
  }
  if (params.tutorId) {
    queries.push(
      supabase.from('school_class_groups')
        .select('id, organization_id, name, tutor_id')
        .eq('tutor_id', params.tutorId),
    );
  }
  if (params.studentIds.length) {
    queries.push(
      supabase.from('school_class_group_members')
        .select('group:school_class_groups!school_class_group_members_group_id_fkey(id, organization_id, name, tutor_id)')
        .in('student_id', params.studentIds),
    );
  }

  const results = await Promise.all(queries);
  const byId = new Map<string, GroupRow>();
  for (const result of results) {
    if (result.error) throw result.error;
    for (const raw of (result.data || []) as Array<GroupRow & { group?: GroupRow | GroupRow[] | null }>) {
      const nested = Array.isArray(raw.group) ? raw.group[0] : raw.group;
      const row = nested || raw;
      if (row?.id && row.organization_id) byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

/**
 * Resolve access from live relationships, using the service-role client only
 * inside an authenticated API. This deliberately does not trust a role or
 * group ID supplied by the browser.
 */
export async function resolveRecordingViewerAccess(
  supabase: SupabaseClient,
  userId: string,
  requestedStudentId?: string,
): Promise<RecordingViewerAccess> {
  const [admin, profile, studentIds] = await Promise.all([
    getOrgAdminAccessByUserId(supabase, userId),
    supabase.from('profiles').select('id, organization_id').eq('id', userId).maybeSingle(),
    recordingStudentIds(supabase, userId, requestedStudentId),
  ]);
  if (profile.error) throw profile.error;

  const adminCanView = Boolean(
    admin && hasOrgAdminPermission(admin.role, admin.permissions, 'sessions.view'),
  );
  const rows = await groupRowsForViewer(supabase, {
    adminOrgId: adminCanView ? admin?.organizationId : null,
    tutorId: profile.data?.id || null,
    studentIds,
  });
  let studentOrganizationIds: string[] = [];
  if (studentIds.length) {
    const { data: studentOrganizations, error } = await supabase
      .from('students')
      .select('organization_id')
      .in('id', studentIds);
    if (error) throw error;
    studentOrganizationIds = uniqueStrings(
      (studentOrganizations || []).map((row: { organization_id: string | null }) => row.organization_id),
    );
  }
  const candidateOrgIds = uniqueStrings([
    ...(rows || []).map((row) => row.organization_id),
    adminCanView ? admin?.organizationId : null,
    profile.data?.organization_id,
    ...studentOrganizationIds,
  ]);

  let enabledOrgIds = new Set<string>();
  if (candidateOrgIds.length) {
    const { data: organizations, error } = await supabase
      .from('organizations')
      .select('id, entity_type, features')
      .in('id', candidateOrgIds);
    if (error) throw error;
    enabledOrgIds = new Set(
      ((organizations || []) as Array<{
        id: string;
        entity_type: string | null;
        features: Record<string, unknown> | null;
      }>)
        .filter((org) => org.entity_type === 'school' && org.features?.school_lesson_recordings === true)
        .map((org) => org.id),
    );
  }

  const groups = rows
    .filter((row) => enabledOrgIds.has(row.organization_id))
    .map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      name: row.name,
      tutorId: row.tutor_id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'lt'));
  const canManage = Boolean(
    admin
    && enabledOrgIds.has(admin.organizationId)
    && hasOrgAdminPermission(admin.role, admin.permissions, 'sessions.edit'),
  );

  return {
    groups,
    organizationIds: [...enabledOrgIds],
    canManage,
    isAdmin: adminCanView,
    isTutor: groups.some((group) => group.tutorId === userId),
    isStudentOrParent: studentIds.length > 0,
  };
}

/**
 * Homework / email link: the HMAC already named the student. Re-check that
 * this student is still a live member of the group and that recordings are
 * enabled for that school. No Tutlio login is involved.
 */
export async function resolveHomeworkRecordingGroup(
  supabase: SupabaseClient,
  studentId: string,
  groupId: string,
): Promise<{ id: string; organizationId: string } | null> {
  if (!studentId || !groupId) return null;
  const { data: student, error: studentError } = await supabase
    .from('students')
    .select('id, organization_id, detached_at')
    .eq('id', studentId)
    .maybeSingle();
  if (studentError) throw studentError;
  const organizationId = (student as { organization_id?: string | null } | null)?.organization_id || null;
  if (!student || (student as { detached_at?: string | null }).detached_at || !organizationId) return null;

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, entity_type, features')
    .eq('id', organizationId)
    .maybeSingle();
  if (orgError) throw orgError;
  const features = ((org as { features?: Record<string, unknown> | null } | null)?.features || null);
  if (
    !org
    || String((org as { entity_type?: string | null }).entity_type || '') !== 'school'
    || features?.school_lesson_recordings !== true
  ) return null;

  const { data: member, error: memberError } = await supabase
    .from('school_class_group_members')
    .select('group_id')
    .eq('student_id', studentId)
    .eq('group_id', groupId)
    .maybeSingle();
  if (memberError) throw memberError;
  if (!member) return null;

  const { data: group, error: groupError } = await supabase
    .from('school_class_groups')
    .select('id, organization_id')
    .eq('id', groupId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (groupError) throw groupError;
  if (!group?.id || !group.organization_id) return null;
  return { id: group.id, organizationId: group.organization_id };
}
