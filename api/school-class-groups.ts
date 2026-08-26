import type { VercelRequest, VercelResponse } from './types';
import { requireOrgAdminAccess } from './_lib/orgAdminAccess.js';
import { verifyRequestAuth } from './_lib/auth.js';
import { serviceSupabase } from './_lib/extraLessonsContractShared.js';
import { validateSchoolClassGroup, type SchoolClassGroupDraft } from '../src/lib/schoolClassGroups.js';

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

  const orgId = admin.ok ? admin.access.organizationId : profile?.organization_id;
  if (!orgId) return res.status(403).json({ error: 'No organization' });

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('school_class_groups')
      .select('*, slots:school_class_group_slots(*), members:school_class_group_members(student_id, enrolled_at, student:students(full_name, email))')
      .eq('organization_id', orgId)
      .order('name');
    if (error) return res.status(500).json({ error: error.message });
    const mine = admin.ok ? data : (data || []).filter((g) => g.tutor_id === auth.userId);
    return res.status(200).json({ groups: mine || [] });
  }

  if (req.method === 'POST') {
    const body = (req.body || {}) as Record<string, unknown>;
    const draft: SchoolClassGroupDraft = {
      name: String(body.name || '').trim(),
      tutor_id: String(body.tutor_id || auth.userId),
      subject_id: body.subject_id ? String(body.subject_id) : null,
      school_year_start: String(body.school_year_start || ''),
      school_year_end: String(body.school_year_end || ''),
      platform: String(body.platform || 'Google Meet'),
      duration_minutes: Number(body.duration_minutes || 45),
      meeting_link: body.meeting_link ? String(body.meeting_link) : null,
      slots: Array.isArray(body.slots) ? body.slots as any : [],
    };
    const errors = validateSchoolClassGroup(draft);
    if (errors.length) return res.status(400).json({ error: 'Invalid group', fields: errors });
    if (!admin.ok && draft.tutor_id !== auth.userId) {
      return res.status(403).json({ error: 'Teachers can only create their own groups' });
    }

    const { data: group, error } = await supabase
      .from('school_class_groups')
      .insert({
        organization_id: orgId,
        tutor_id: draft.tutor_id,
        subject_id: draft.subject_id,
        name: draft.name,
        school_year_start: draft.school_year_start,
        school_year_end: draft.school_year_end,
        platform: draft.platform,
        duration_minutes: draft.duration_minutes,
        meeting_link: draft.meeting_link,
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
    const memberIds = Array.isArray(body.student_ids) ? body.student_ids.map(String) : [];
    if (memberIds.length && admin.ok) {
      await supabase.from('school_class_group_members').insert(
        memberIds.map((student_id) => ({ group_id: group.id, student_id })),
      );
    }
    return res.status(200).json({ ok: true, group });
  }

  if (req.method === 'PATCH') {
    if (!admin.ok) return res.status(403).json({ error: 'Admin only' });
    const body = (req.body || {}) as Record<string, unknown>;
    const groupId = String(body.id || '').trim();
    if (!groupId) return res.status(400).json({ error: 'Missing id' });
    const studentIds = Array.isArray(body.student_ids) ? body.student_ids.map(String) : null;
    if (studentIds) {
      await supabase.from('school_class_group_members').delete().eq('group_id', groupId);
      if (studentIds.length) {
        await supabase.from('school_class_group_members').insert(
          studentIds.map((student_id) => ({ group_id: groupId, student_id })),
        );
      }
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof body.name === 'string') patch.name = body.name;
    if (typeof body.meeting_link === 'string') patch.meeting_link = body.meeting_link;
    await supabase.from('school_class_groups').update(patch).eq('id', groupId).eq('organization_id', orgId);
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    if (!admin.ok) return res.status(403).json({ error: 'Admin only' });
    const id = String((req.query?.id || (req.body as any)?.id || '')).trim();
    if (!id) return res.status(400).json({ error: 'Missing id' });
    const { error } = await supabase.from('school_class_groups').delete().eq('id', id).eq('organization_id', orgId);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
