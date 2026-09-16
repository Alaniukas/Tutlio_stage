import type { SupabaseClient } from '@supabase/supabase-js';
import { getOrgAdminAccessByUserId } from './orgAdminAccess.js';
import { hasOrgAdminPermission } from '../../src/lib/orgAdminPermissions.js';

export interface RecordingViewerGroup {
  id: string;
  sourceId: string;
  kind: 'class_group' | 'individual';
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

type RecurringRow = {
  subject_id: string | null;
  tutor_id: string;
  student_id: string;
};

type SubjectRow = {
  id: string;
  name: string;
  tutor_id: string;
};

type TutorOrgRow = {
  id: string;
  organization_id: string | null;
};

const INDIVIDUAL_TARGET_PREFIX = 'subject:';

export function individualRecordingTargetId(subjectId: string): string {
  return `${INDIVIDUAL_TARGET_PREFIX}${subjectId}`;
}

export function parseRecordingTargetId(value: string): {
  kind: 'class_group' | 'individual';
  sourceId: string;
} | null {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;
  if (trimmed.startsWith(INDIVIDUAL_TARGET_PREFIX)) {
    const sourceId = trimmed.slice(INDIVIDUAL_TARGET_PREFIX.length).trim();
    return sourceId ? { kind: 'individual', sourceId } : null;
  }
  return { kind: 'class_group', sourceId: trimmed };
}

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

async function individualRowsForViewer(
  supabase: SupabaseClient,
  params: {
    adminOrgId?: string | null;
    tutorId?: string | null;
    studentIds: string[];
  },
): Promise<Array<SubjectRow & { organization_id: string }>> {
  let adminTutorIds: string[] = [];
  if (params.adminOrgId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('organization_id', params.adminOrgId);
    if (error) throw error;
    adminTutorIds = (data || []).map((row: { id: string }) => row.id);
  }

  const recurringQueries: Array<PromiseLike<{ data: unknown; error: { message?: string } | null }>> = [];
  const tutorIds = uniqueStrings([...adminTutorIds, params.tutorId]);
  if (tutorIds.length) {
    recurringQueries.push(
      supabase.from('recurring_individual_sessions')
        .select('subject_id, tutor_id, student_id')
        .in('tutor_id', tutorIds)
        .eq('active', true),
    );
  }
  if (params.studentIds.length) {
    recurringQueries.push(
      supabase.from('recurring_individual_sessions')
        .select('subject_id, tutor_id, student_id')
        .in('student_id', params.studentIds)
        .eq('active', true),
    );
  }
  if (!recurringQueries.length) return [];

  const recurringResults = await Promise.all(recurringQueries);
  const recurringBySubject = new Map<string, RecurringRow>();
  for (const result of recurringResults) {
    if (result.error) throw result.error;
    for (const row of (result.data || []) as RecurringRow[]) {
      if (row.subject_id && row.tutor_id) recurringBySubject.set(row.subject_id, row);
    }
  }
  const subjectIds = [...recurringBySubject.keys()];
  if (!subjectIds.length) return [];

  const recurringTutorIds = uniqueStrings(
    [...recurringBySubject.values()].map((row) => row.tutor_id),
  );
  const [{ data: subjects, error: subjectError }, { data: tutors, error: tutorError }] = await Promise.all([
    supabase.from('subjects').select('id, name, tutor_id').in('id', subjectIds),
    supabase.from('profiles').select('id, organization_id').in('id', recurringTutorIds),
  ]);
  if (subjectError || tutorError) throw subjectError || tutorError;

  const orgByTutor = new Map(
    ((tutors || []) as TutorOrgRow[]).map((row) => [row.id, row.organization_id]),
  );
  return ((subjects || []) as SubjectRow[]).flatMap((subject) => {
    const recurring = recurringBySubject.get(subject.id);
    const organizationId = recurring ? orgByTutor.get(recurring.tutor_id) : null;
    if (!recurring || !organizationId || subject.tutor_id !== recurring.tutor_id) return [];
    return [{ ...subject, organization_id: organizationId }];
  });
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
  const accessParams = {
    adminOrgId: adminCanView ? admin?.organizationId : null,
    tutorId: profile.data?.id || null,
    studentIds,
  };
  const [rows, individualRows] = await Promise.all([
    groupRowsForViewer(supabase, accessParams),
    individualRowsForViewer(supabase, accessParams),
  ]);
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
    ...individualRows.map((row) => row.organization_id),
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

  const groups: RecordingViewerGroup[] = rows
    .filter((row) => enabledOrgIds.has(row.organization_id))
    .map((row) => ({
      id: row.id,
      sourceId: row.id,
      kind: 'class_group' as const,
      organizationId: row.organization_id,
      name: row.name,
      tutorId: row.tutor_id,
    }));
  groups.push(...individualRows
    .filter((row) => enabledOrgIds.has(row.organization_id))
    .map((row) => ({
      id: individualRecordingTargetId(row.id),
      sourceId: row.id,
      kind: 'individual' as const,
      organizationId: row.organization_id,
      name: row.name,
      tutorId: row.tutor_id,
    })));
  groups
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
): Promise<RecordingViewerGroup | null> {
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

  const target = parseRecordingTargetId(groupId);
  if (!target) return null;
  if (target.kind === 'individual') {
    const { data: recurringRows, error: recurringError } = await supabase
      .from('recurring_individual_sessions')
      .select('subject_id, tutor_id')
      .eq('student_id', studentId)
      .eq('subject_id', target.sourceId)
      .eq('active', true)
      .limit(1);
    if (recurringError) throw recurringError;
    const recurring = (recurringRows || [])[0] as { subject_id?: string; tutor_id?: string } | undefined;
    if (!recurring?.subject_id || !recurring.tutor_id) return null;

    const [{ data: subject, error: subjectError }, { data: tutor, error: tutorError }] = await Promise.all([
      supabase.from('subjects').select('id, name, tutor_id').eq('id', target.sourceId).maybeSingle(),
      supabase.from('profiles').select('id, organization_id').eq('id', recurring.tutor_id).maybeSingle(),
    ]);
    if (subjectError || tutorError) throw subjectError || tutorError;
    if (
      !subject?.id
      || subject.tutor_id !== recurring.tutor_id
      || tutor?.organization_id !== organizationId
    ) return null;
    return {
      id: individualRecordingTargetId(subject.id),
      sourceId: subject.id,
      kind: 'individual',
      organizationId,
      name: subject.name || '',
      tutorId: recurring.tutor_id,
    };
  }

  const { data: member, error: memberError } = await supabase
    .from('school_class_group_members')
    .select('group_id')
    .eq('student_id', studentId)
    .eq('group_id', target.sourceId)
    .maybeSingle();
  if (memberError) throw memberError;
  if (!member) return null;

  const { data: group, error: groupError } = await supabase
    .from('school_class_groups')
    .select('id, organization_id, name, tutor_id')
    .eq('id', target.sourceId)
    .eq('organization_id', organizationId)
    .maybeSingle();
  if (groupError) throw groupError;
  if (!group?.id || !group.organization_id) return null;
  return {
    id: group.id,
    sourceId: group.id,
    kind: 'class_group',
    organizationId: group.organization_id,
    name: group.name || '',
    tutorId: group.tutor_id || null,
  };
}
