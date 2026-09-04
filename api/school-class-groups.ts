import type { VercelRequest, VercelResponse } from './types';
import { requireOrgAdminAccess } from './_lib/orgAdminAccess.js';
import { verifyRequestAuth } from './_lib/auth.js';
import { serviceSupabase } from './_lib/extraLessonsContractShared.js';
import {
  classGroupRowFields,
  parseClassGroupWriteBody,
  validateSchoolClassGroup,
} from '../src/lib/schoolClassGroups.js';

const GROUP_SELECT = '*, slots:school_class_group_slots(*), members:school_class_group_members(student_id, enrolled_at, student:students(full_name, email))';

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
    const { data, error } = await supabase
      .from('school_class_groups')
      .select(GROUP_SELECT)
      .eq('organization_id', orgId)
      .order('name');
    if (error) return res.status(500).json({ error: error.message });
    if (admin.ok) {
      return res.status(200).json({ groups: data || [] });
    }
    if (profile?.organization_id === orgId) {
      const tutorGroups = (data || []).filter((g) => g.tutor_id === auth.userId);
      return res.status(200).json({ groups: tutorGroups });
    }
    if (portalStudentIds.length) {
      const { data: memberships } = await supabase
        .from('school_class_group_members')
        .select('group_id')
        .in('student_id', portalStudentIds);
      const groupIds = new Set((memberships || []).map((row: { group_id: string }) => row.group_id));
      const studentGroups = (data || []).filter((g) => groupIds.has(g.id));
      return res.status(200).json({ groups: studentGroups });
    }
    return res.status(200).json({ groups: [] });
  }

  if (req.method === 'POST') {
    const body = (req.body || {}) as Record<string, unknown>;
    const draft = parseClassGroupWriteBody(body, admin.ok ? '' : auth.userId);
    const errors = validateSchoolClassGroup(draft);
    if (errors.length) return res.status(400).json({ error: 'Invalid group', fields: errors });
    if (!admin.ok && draft.tutor_id !== auth.userId) {
      return res.status(403).json({ error: 'Teachers can only create their own groups' });
    }
    if (admin.ok) {
      const { data: tutor } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', draft.tutor_id)
        .eq('organization_id', orgId)
        .maybeSingle();
      if (!tutor) return res.status(400).json({ error: 'Teacher is not in this organization' });
    }

    const { data: group, error } = await supabase
      .from('school_class_groups')
      .insert({
        organization_id: orgId,
        ...classGroupRowFields(draft),
        created_by: auth.userId,
      })
      .select('*')
      .single();
    if (error || !group) return res.status(500).json({ error: error?.message || 'Insert failed' });

    if (draft.slots.length) {
      await supabase.from('school_class_group_slots').insert(
        draft.slots.map((s) => ({
          group_id: group.id,
          weekday: s.weekday,
          start_time: s.start_time,
          end_time: s.end_time,
        })),
      );
    }
    if (draft.student_ids?.length && admin.ok) {
      const { data: owned } = await supabase
        .from('students')
        .select('id')
        .eq('organization_id', orgId)
        .in('id', draft.student_ids);
      const allowed = new Set((owned || []).map((row: { id: string }) => row.id));
      const memberIds = draft.student_ids.filter((id) => allowed.has(id));
      if (memberIds.length) {
        await supabase.from('school_class_group_members').insert(
          memberIds.map((student_id) => ({ group_id: group.id, student_id })),
        );
      }
    }
    return res.status(200).json({ ok: true, group });
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
      await supabase.from('school_class_group_slots').delete().eq('group_id', groupId);
      if (draft.slots.length) {
        await supabase.from('school_class_group_slots').insert(
          draft.slots.map((s) => ({
            group_id: groupId,
            weekday: s.weekday,
            start_time: s.start_time,
            end_time: s.end_time,
          })),
        );
      }
    }

    if (editAdmin.ok && draft.student_ids !== null) {
      const uniqueIds = draft.student_ids;
      let allowed = uniqueIds;
      if (uniqueIds.length) {
        const { data: owned } = await supabase
          .from('students')
          .select('id')
          .eq('organization_id', orgId)
          .in('id', uniqueIds);
        const ok = new Set((owned || []).map((row: { id: string }) => row.id));
        allowed = uniqueIds.filter((id) => ok.has(id));
      }
      await supabase.from('school_class_group_members').delete().eq('group_id', groupId);
      if (allowed.length) {
        await supabase.from('school_class_group_members').insert(
          allowed.map((student_id) => ({ group_id: groupId, student_id })),
        );
      }
    }

    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const editAdmin = await requireOrgAdminAccess(req, supabase, 'sessions.edit');
    if (!editAdmin.ok) return res.status(403).json({ error: 'Admin only' });
    const id = String((req.query?.id || (req.body as { id?: string })?.id || '')).trim();
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const { error } = await supabase.from('school_class_groups').delete().eq('id', id).eq('organization_id', orgId);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
