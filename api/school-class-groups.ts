import type { VercelRequest, VercelResponse } from './types';
import { requireOrgAdminAccess } from './_lib/orgAdminAccess.js';
import { verifyRequestAuth } from './_lib/auth.js';
import { serviceSupabase } from './_lib/extraLessonsContractShared.js';
import {
  classGroupRowFields,
  parseClassGroupWriteBody,
  validateSchoolClassGroup,
  validateSchoolMemberSchedules,
  type SchoolClassGroupMemberWrite,
} from '../src/lib/schoolClassGroups.js';
import {
  materializeClassGroupNow,
  removeFutureClassGroupSessions,
  type ReconcileResult,
} from './_lib/schoolClassGroupMaterialize.js';

const GROUP_SELECT = '*, tutor:profiles!school_class_groups_tutor_id_fkey(full_name), slots:school_class_group_slots(*), members:school_class_group_members(student_id, enrolled_at, schedule_slots, student:students(full_name, email, grade))';

async function ownedMembers(
  supabase: ReturnType<typeof serviceSupabase>,
  orgId: string,
  members: SchoolClassGroupMemberWrite[] | null,
): Promise<SchoolClassGroupMemberWrite[] | null> {
  if (members === null || members.length === 0) return members;
  const { data, error } = await supabase.from('students').select('id')
    .eq('organization_id', orgId).in('id', members.map((member) => member.student_id));
  if (error) throw error;
  const allowed = new Set((data || []).map((row) => row.id));
  if (members.some((member) => !allowed.has(member.student_id))) {
    throw new Error('Student is not in this organization');
  }
  return members;
}

async function saveGroupMembers(
  supabase: ReturnType<typeof serviceSupabase>,
  groupId: string,
  members: SchoolClassGroupMemberWrite[] | null,
): Promise<void> {
  if (members === null) return;
  const { data: existing, error: loadError } = await supabase.from('school_class_group_members')
    .select('student_id, enrolled_at').eq('group_id', groupId);
  if (loadError) throw loadError;
  const enrolledAtByStudent = new Map((existing || []).map((row) => [row.student_id, row.enrolled_at]));
  const wanted = new Set(members.map((member) => member.student_id));
  const removed = (existing || []).map((row) => row.student_id).filter((id) => !wanted.has(id));
  if (removed.length) {
    const { error } = await supabase.from('school_class_group_members').delete()
      .eq('group_id', groupId).in('student_id', removed);
    if (error) throw error;
  }
  if (members.length) {
    const { error } = await supabase.from('school_class_group_members').upsert(
      members.map((member) => ({
        group_id: groupId,
        ...member,
        ...(enrolledAtByStudent.has(member.student_id)
          ? { enrolled_at: enrolledAtByStudent.get(member.student_id) }
          : {}),
      })),
      { onConflict: 'group_id,student_id' },
    );
    if (error) throw error;
  }
}

/**
 * Lessons show up in every calendar right after save (the hourly cron used to
 * be the only writer, so admins waited up to an hour). A materialize failure
 * must not lose the saved group — it is reported and the cron heals it later.
 */
async function syncGroupSessions(
  supabase: ReturnType<typeof serviceSupabase>,
  groupId: string,
  orgId: string,
): Promise<{ materialized: ReconcileResult | null; materializeError?: string }> {
  try {
    const materialized = await materializeClassGroupNow(supabase, groupId, orgId);
    return { materialized };
  } catch (e) {
    const message = (e as Error)?.message || 'materialize failed';
    console.error('[school-class-groups] materialize failed', groupId, message);
    return { materialized: null, materializeError: message };
  }
}

async function resolveStudentIdsForPortal(
  supabase: ReturnType<typeof serviceSupabase>,
  userId: string,
  studentIdParam: string,
): Promise<string[]> {
  if (studentIdParam) {
    const [{ data: student }, { data: parentProfile }] = await Promise.all([
      supabase.from('students').select('id, linked_user_id').eq('id', studentIdParam).maybeSingle(),
      supabase.from('parent_profiles').select('id').eq('user_id', userId).maybeSingle(),
    ]);
    if (!student) return [];
    if (student.linked_user_id === userId) return [student.id];
    if (parentProfile?.id) {
      const { data: link } = await supabase
        .from('parent_students')
        .select('id')
        .eq('parent_id', parentProfile.id)
        .eq('student_id', studentIdParam)
        .maybeSingle();
      if (link) return [studentIdParam];
    }
    return [];
  }

  const { data: linkedStudents } = await supabase
    .from('students')
    .select('id')
    .eq('linked_user_id', userId);
  return (linkedStudents || []).map((row: { id: string }) => row.id);
}

async function resolveOrgIdForClassGroups(
  supabase: ReturnType<typeof serviceSupabase>,
  adminOrgId: string | null | undefined,
  profileOrgId: string | null | undefined,
  studentIds: string[],
): Promise<string | null> {
  if (adminOrgId) return adminOrgId;
  if (profileOrgId) return profileOrgId;
  if (!studentIds.length) return null;
  const { data: studentRow } = await supabase
    .from('students')
    .select('organization_id')
    .eq('id', studentIds[0])
    .maybeSingle();
  return studentRow?.organization_id ?? null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabase = serviceSupabase();
  const auth = await verifyRequestAuth(req);
  if (!auth?.userId) return res.status(401).json({ error: 'Unauthorized' });

  const admin = await requireOrgAdminAccess(req, supabase, 'sessions.view');
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, organization_id')
    .eq('id', auth.userId)
    .maybeSingle();

  const studentIdParam = String(req.query?.studentId || '').trim();
  const portalStudentIds = await resolveStudentIdsForPortal(supabase, auth.userId, studentIdParam);
  const orgId = await resolveOrgIdForClassGroups(
    supabase,
    admin.ok ? admin.access.organizationId : null,
    profile?.organization_id,
    portalStudentIds,
  );
  if (!orgId) return res.status(403).json({ error: 'No organization' });

  if (req.method === 'GET') {
    const canManageGroups = admin.ok || profile?.organization_id === orgId;
    const [groupsResult, studentsResult] = await Promise.all([
      supabase
        .from('school_class_groups')
        .select(GROUP_SELECT)
        .eq('organization_id', orgId)
        .order('name'),
      canManageGroups
        ? supabase
            .from('students')
            .select('id, full_name, grade, enrollment_status')
            .eq('organization_id', orgId)
            .is('detached_at', null)
            .order('full_name')
        : Promise.resolve({ data: [], error: null }),
    ]);
    const { data, error } = groupsResult;
    if (error) return res.status(500).json({ error: error.message });
    if (studentsResult.error) return res.status(500).json({ error: studentsResult.error.message });
    const students = studentsResult.data || [];
    if (admin.ok) {
      return res.status(200).json({ groups: data || [], students });
    }
    if (profile?.organization_id === orgId) {
      const tutorGroups = (data || []).filter((g) => g.tutor_id === auth.userId);
      return res.status(200).json({ groups: tutorGroups, students });
    }
    if (portalStudentIds.length) {
      const { data: memberships } = await supabase
        .from('school_class_group_members')
        .select('group_id')
        .in('student_id', portalStudentIds);
      const groupIds = new Set((memberships || []).map((row: { group_id: string }) => row.group_id));
      const visibleStudents = new Set(portalStudentIds);
      const studentGroups = (data || []).filter((g) => groupIds.has(g.id)).map((g) => ({
        ...g,
        members: (g.members || []).filter((member: { student_id: string }) => visibleStudents.has(member.student_id)),
      }));
      return res.status(200).json({ groups: studentGroups });
    }
    return res.status(200).json({ groups: [] });
  }

  if (req.method === 'POST') {
    const createAdmin = await requireOrgAdminAccess(req, supabase, 'sessions.edit');
    const body = (req.body || {}) as Record<string, unknown>;
    const draft = parseClassGroupWriteBody(body, createAdmin.ok ? '' : auth.userId);
    const errors = validateSchoolClassGroup(draft);
    if (errors.length) return res.status(400).json({ error: 'Invalid group', fields: errors });
    const requestedMembers = draft.members ?? draft.student_ids?.map((student_id) => ({ student_id, schedule_slots: null })) ?? null;
    if (!validateSchoolMemberSchedules(draft.slots, requestedMembers)) {
      return res.status(400).json({ error: 'Pasirinkite bent vieną galiojantį laiką kiekvienam grupės mokiniui.' });
    }
    if (!createAdmin.ok && draft.tutor_id !== auth.userId) {
      return res.status(403).json({ error: 'Teachers can only create their own groups' });
    }
    if (createAdmin.ok) {
      const { data: tutor } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', draft.tutor_id)
        .eq('organization_id', orgId)
        .maybeSingle();
      if (!tutor) return res.status(400).json({ error: 'Teacher is not in this organization' });
    }

    let members: SchoolClassGroupMemberWrite[] | null;
    try {
      members = await ownedMembers(supabase, orgId, requestedMembers);
    } catch (memberError) {
      return res.status(400).json({ error: (memberError as Error).message });
    }

    const { data: group, error } = await supabase
      .from('school_class_groups')
      .insert({
        organization_id: orgId,
        ...classGroupRowFields(draft),
        created_by: auth.userId,
        ...(draft.admin_action_required && !createAdmin.ok ? {
          admin_action_requested_at: new Date().toISOString(),
          admin_action_requested_by: auth.userId,
        } : {}),
      })
      .select('*')
      .single();
    if (error || !group) return res.status(500).json({ error: error?.message || 'Insert failed' });

    if (draft.slots.length) {
      const { error: slotError } = await supabase.from('school_class_group_slots').insert(
        draft.slots.map((s) => ({
          group_id: group.id,
          weekday: s.weekday,
          start_time: s.start_time,
          end_time: s.end_time,
        })),
      );
      if (slotError) {
        await supabase.from('school_class_groups').delete().eq('id', group.id);
        return res.status(500).json({ error: slotError.message });
      }
    }
    try {
      await saveGroupMembers(supabase, group.id, members);
    } catch (memberError) {
      await supabase.from('school_class_groups').delete().eq('id', group.id);
      return res.status(500).json({ error: (memberError as Error).message });
    }
    const sync = await syncGroupSessions(supabase, group.id, orgId);
    return res.status(200).json({ ok: true, group, ...sync });
  }

  if (req.method === 'PATCH') {
    const body = (req.body || {}) as Record<string, unknown>;
    const groupId = String(body.id || '').trim();
    if (!groupId) return res.status(400).json({ error: 'Missing id' });

    const { data: existing, error: loadErr } = await supabase
      .from('school_class_groups')
      .select('id, tutor_id')
      .eq('id', groupId)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (loadErr) return res.status(500).json({ error: loadErr.message });
    if (!existing) return res.status(404).json({ error: 'Group not found' });

    const editAdmin = await requireOrgAdminAccess(req, supabase, 'sessions.edit');
    const isTutorOwner = existing.tutor_id === auth.userId;
    if (!editAdmin.ok && !isTutorOwner) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const draft = parseClassGroupWriteBody(body, existing.tutor_id);
    if (!editAdmin.ok) draft.tutor_id = existing.tutor_id;
    const errors = validateSchoolClassGroup(draft);
    if (errors.length) return res.status(400).json({ error: 'Invalid group', fields: errors });
    const requestedMembers = editAdmin.ok
      ? (draft.members ?? draft.student_ids?.map((student_id) => ({ student_id, schedule_slots: null })) ?? null)
      : null;
    if (!validateSchoolMemberSchedules(draft.slots, requestedMembers)) {
      return res.status(400).json({ error: 'Pasirinkite bent vieną galiojantį laiką kiekvienam grupės mokiniui.' });
    }
    if (!editAdmin.ok && Array.isArray(body.slots)) {
      const { data: currentMembers, error: scheduleError } = await supabase
        .from('school_class_group_members').select('student_id, schedule_slots').eq('group_id', groupId);
      if (scheduleError) return res.status(500).json({ error: scheduleError.message });
      if (!validateSchoolMemberSchedules(draft.slots, (currentMembers || []) as SchoolClassGroupMemberWrite[])) {
        return res.status(400).json({ error: 'Pakeitus grupės laiką, administracija turi atnaujinti vaikų pasirinktus laikus.' });
      }
    }
    let members: SchoolClassGroupMemberWrite[] | null;
    try {
      members = await ownedMembers(supabase, orgId, requestedMembers);
    } catch (memberError) {
      return res.status(400).json({ error: (memberError as Error).message });
    }

    if (editAdmin.ok && draft.tutor_id !== existing.tutor_id) {
      const { data: tutor } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', draft.tutor_id)
        .eq('organization_id', orgId)
        .maybeSingle();
      if (!tutor) return res.status(400).json({ error: 'Teacher is not in this organization' });
    }

    const { error: updErr } = await supabase
      .from('school_class_groups')
      .update({ ...classGroupRowFields(draft), updated_at: new Date().toISOString() })
      .eq('id', groupId)
      .eq('organization_id', orgId);
    if (updErr) return res.status(500).json({ error: updErr.message });

    if (Array.isArray(body.slots)) {
      const { error: deleteError } = await supabase.from('school_class_group_slots').delete().eq('group_id', groupId);
      if (deleteError) return res.status(500).json({ error: deleteError.message });
      if (draft.slots.length) {
        const { error: slotError } = await supabase.from('school_class_group_slots').insert(
          draft.slots.map((s) => ({
            group_id: groupId,
            weekday: s.weekday,
            start_time: s.start_time,
            end_time: s.end_time,
          })),
        );
        if (slotError) return res.status(500).json({ error: slotError.message });
      }
    }
    try {
      await saveGroupMembers(supabase, groupId, members);
    } catch (memberError) {
      return res.status(500).json({ error: (memberError as Error).message });
    }

    // A teacher raises the flag. An administrator resolves it by reviewing and
    // saving the group, so the dashboard task disappears from live state.
    const attentionPatch = editAdmin.ok
      ? {
          admin_action_required: false,
          admin_action_note: null,
          admin_action_resolved_at: new Date().toISOString(),
          admin_action_resolved_by: auth.userId,
        }
      : draft.admin_action_required
        ? {
            admin_action_required: true,
            admin_action_note: draft.admin_action_note,
            admin_action_requested_at: new Date().toISOString(),
            admin_action_requested_by: auth.userId,
            admin_action_resolved_at: null,
            admin_action_resolved_by: null,
          }
        : {
            admin_action_required: false,
            admin_action_note: null,
          };
    const { error: attentionError } = await supabase
      .from('school_class_groups')
      .update(attentionPatch)
      .eq('id', groupId)
      .eq('organization_id', orgId);
    if (attentionError) return res.status(500).json({ error: attentionError.message });

    const sync = await syncGroupSessions(supabase, groupId, orgId);
    return res.status(200).json({ ok: true, ...sync });
  }

  if (req.method === 'DELETE') {
    const editAdmin = await requireOrgAdminAccess(req, supabase, 'sessions.edit');
    if (!editAdmin.ok) return res.status(403).json({ error: 'Admin only' });
    const id = String((req.query?.id || (req.body as { id?: string })?.id || '')).trim();
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const { data: target } = await supabase
      .from('school_class_groups')
      .select('id')
      .eq('id', id)
      .eq('organization_id', orgId)
      .maybeSingle();
    if (!target) return res.status(404).json({ error: 'Group not found' });
    // The FK only nulls `sessions.class_group_id`; generated future lessons must go too.
    let removedSessions = 0;
    try {
      removedSessions = await removeFutureClassGroupSessions(supabase, id);
    } catch (e) {
      return res.status(500).json({ error: (e as Error)?.message || 'Failed to remove group lessons' });
    }
    const { error } = await supabase.from('school_class_groups').delete().eq('id', id).eq('organization_id', orgId);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, removedSessions });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
