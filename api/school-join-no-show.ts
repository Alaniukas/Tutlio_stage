import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { requireCronAuth } from './_lib/cronAuth.js';
import {
  NO_SHOW_REASON_MISSED_JOIN,
  orgHasJoinNoShow,
  shouldMarkStudentNoShowFromMissedJoin,
} from '../src/lib/schoolJoinNoShow.js';
import { buildNoShowSessionPatch, defaultNoShowWhenForNow } from '../src/lib/noShowWhen.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireCronAuth(req, res)) return;

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const now = new Date();
  const lookback = new Date(now.getTime() - 7 * 24 * 3600000).toISOString();
  const { data: sessions, error } = await supabase
    .from('sessions')
    .select('id, tutor_id, start_time, end_time, status, meeting_link, student_joined_at, tutor_joined_at, tutor_comment')
    .eq('status', 'active')
    .not('meeting_link', 'is', null)
    .is('student_joined_at', null)
    .lt('start_time', now.toISOString())
    .gte('start_time', lookback)
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });
  const rows = sessions || [];
  if (!rows.length) return res.status(200).json({ success: true, updated: 0 });

  const tutorIds = [...new Set(rows.map((s) => s.tutor_id).filter(Boolean))] as string[];
  const { data: tutors } = await supabase.from('profiles').select('id, organization_id').in('id', tutorIds);
  const orgByTutor = new Map((tutors || []).map((t) => [t.id, t.organization_id]));
  const orgIds = [...new Set([...orgByTutor.values()].filter(Boolean))] as string[];
  const { data: orgs } = await supabase.from('organizations').select('id, features').in('id', orgIds);
  const flagged = new Set(
    (orgs || [])
      .filter((o) => orgHasJoinNoShow((o.features || {}) as Record<string, unknown>))
      .map((o) => o.id),
  );

  let updated = 0;
  for (const session of rows) {
    const orgId = session.tutor_id ? orgByTutor.get(session.tutor_id) : null;
    if (!orgId || !flagged.has(orgId)) continue;
    if (!shouldMarkStudentNoShowFromMissedJoin(session as any, now)) continue;
    const start = new Date(session.start_time);
    const end = session.end_time ? new Date(session.end_time) : new Date(start.getTime() + 45 * 60000);
    const patch = buildNoShowSessionPatch(
      defaultNoShowWhenForNow(start, end, now),
      session.tutor_comment,
    );
    const { error: updErr } = await supabase
      .from('sessions')
      .update({ ...patch, no_show_reason: NO_SHOW_REASON_MISSED_JOIN })
      .eq('id', session.id)
      .eq('status', 'active');
    if (!updErr) updated += 1;
  }

  return res.status(200).json({ success: true, updated, scanned: rows.length });
}
