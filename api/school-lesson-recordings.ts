import type { VercelRequest, VercelResponse } from './types';
import { requireOrgAdminAccess } from './_lib/orgAdminAccess.js';
import { verifyRequestAuth } from './_lib/auth.js';
import { serviceSupabase } from './_lib/extraLessonsContractShared.js';
import { matchRecordingToSession, type RecordingIngestMeta } from '../src/lib/schoolLessonRecordings.js';

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
    let q = supabase
      .from('school_lesson_recordings')
      .select('*, groups:school_lesson_recording_groups(group_id)')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (!admin.ok) {
      const { data: sessions } = await supabase.from('sessions').select('id').eq('tutor_id', auth.userId);
      const ids = (sessions || []).map((s) => s.id);
      q = q.in('session_id', ids.length ? ids : ['00000000-0000-0000-0000-000000000000']);
    }
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ recordings: data || [] });
  }

  if (req.method === 'POST') {
    const body = (req.body || {}) as Record<string, unknown>;
    const meta: RecordingIngestMeta = {
      drive_file_id: String(body.drive_file_id || '').trim(),
      name: String(body.name || body.drive_file_name || '').trim(),
      created_at: String(body.created_at || new Date().toISOString()),
      duration_minutes: body.duration_minutes ? Number(body.duration_minutes) : null,
      meet_conference_id: body.meet_conference_id ? String(body.meet_conference_id) : null,
    };
    if (!meta.drive_file_id) return res.status(400).json({ error: 'Missing drive_file_id' });

    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, start_time, end_time, meeting_link, class_group_id, tutor_id')
      .eq('status', 'completed')
      .gte('start_time', new Date(Date.parse(meta.created_at) - 6 * 3600000).toISOString())
      .lte('start_time', new Date(Date.parse(meta.created_at) + 6 * 3600000).toISOString())
      .limit(50);

    const scoped = admin.ok
      ? (sessions || [])
      : (sessions || []).filter((s) => s.tutor_id === auth.userId);
    const matched = matchRecordingToSession(meta, scoped as any);
    const sessionId = body.session_id ? String(body.session_id) : matched?.id || null;

    const { data: rec, error } = await supabase
      .from('school_lesson_recordings')
      .upsert({
        organization_id: orgId,
        session_id: sessionId,
        drive_file_id: meta.drive_file_id,
        drive_file_name: meta.name,
        drive_web_view_link: body.drive_web_view_link ? String(body.drive_web_view_link) : null,
        recorded_at: meta.created_at,
        duration_minutes: meta.duration_minutes,
        meet_conference_id: meta.meet_conference_id,
        created_by: auth.userId,
      }, { onConflict: 'organization_id,drive_file_id' })
      .select('*')
      .single();
    if (error || !rec) return res.status(500).json({ error: error?.message || 'Upsert failed' });

    const groupIds: string[] = Array.isArray(body.group_ids) ? body.group_ids.map(String) : [];
    if (matched?.class_group_id && !groupIds.includes(matched.class_group_id)) {
      groupIds.push(matched.class_group_id);
    }
    if (groupIds.length) {
      await supabase.from('school_lesson_recording_groups').upsert(
        groupIds.map((group_id) => ({ recording_id: rec.id, group_id })),
        { onConflict: 'recording_id,group_id' },
      );
    }
    return res.status(200).json({ ok: true, recording: rec, matchedSessionId: matched?.id || null });
  }

  if (req.method === 'PATCH') {
    const body = (req.body || {}) as Record<string, unknown>;
    const recordingId = String(body.id || '').trim();
    if (!recordingId) return res.status(400).json({ error: 'Missing id' });
    const groupIds: string[] = Array.isArray(body.group_ids) ? body.group_ids.map(String) : [];
    await supabase.from('school_lesson_recording_groups').delete().eq('recording_id', recordingId);
    if (groupIds.length) {
      await supabase.from('school_lesson_recording_groups').insert(
        groupIds.map((group_id) => ({ recording_id: recordingId, group_id })),
      );
    }
    if (body.session_id) {
      await supabase.from('school_lesson_recordings')
        .update({ session_id: String(body.session_id) })
        .eq('id', recordingId)
        .eq('organization_id', orgId);
    }
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
