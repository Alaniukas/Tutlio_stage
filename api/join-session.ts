// GET /api/join-session?sid=<sessionId>&role=tutor|student&t=<hmac>
// Tracked "join lesson" link used in emails and Google Calendar events:
// records the first join click per side (attendance), then 302-redirects to
// the real meeting link. Works without login — the HMAC token authorizes
// recording for exactly one (session, role) pair.
import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { supabaseServiceRoleClientOptions } from './_lib/supabaseServiceRoleClientOptions.js';
import { isJoinRole, verifyJoinToken } from './_lib/joinLink.js';
import { publicOriginFromRequest } from './_lib/public-origin.js';
import { isWithinJoinClickWindow } from '../src/lib/attendance.js';

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, supabaseServiceRoleClientOptions() as any);
}

function normalizeMeetingUrl(url: string | null | undefined): string | null {
  const trimmed = (url || '').trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const appOrigin = publicOriginFromRequest(req);
  const sid = typeof req.query.sid === 'string' ? req.query.sid.trim() : '';
  const role = typeof req.query.role === 'string' ? req.query.role.trim() : '';
  const token = typeof req.query.t === 'string' ? req.query.t.trim() : '';

  if (!sid || !isJoinRole(role) || !verifyJoinToken(token, sid, role)) {
    return res.status(400).send('Invalid join link');
  }

  const supabase = getSupabase();
  if (!supabase) return res.redirect(302, appOrigin);

  try {
    const { data: session } = await supabase
      .from('sessions')
      .select('id, tutor_id, start_time, end_time, status, meeting_link, tutor_joined_at, student_joined_at')
      .eq('id', sid)
      .maybeSingle();

    if (!session || session.status === 'cancelled') {
      return res.redirect(302, appOrigin);
    }

    const now = new Date();
    if (isWithinJoinClickWindow(now, session.start_time, session.end_time)) {
      const joinedColumn = role === 'tutor' ? 'tutor_joined_at' : 'student_joined_at';
      if (!session[joinedColumn]) {
        if (role === 'tutor') {
          // Group lessons share one slot across several session rows — a single
          // tutor click counts for every parallel row of that slot.
          await supabase
            .from('sessions')
            .update({ tutor_joined_at: now.toISOString() })
            .eq('tutor_id', session.tutor_id)
            .eq('start_time', session.start_time)
            .neq('status', 'cancelled')
            .is('tutor_joined_at', null);
        } else {
          await supabase
            .from('sessions')
            .update({ student_joined_at: now.toISOString() })
            .eq('id', session.id)
            .is('student_joined_at', null);
        }
      }
    }

    const target = normalizeMeetingUrl(session.meeting_link);
    return res.redirect(302, target || appOrigin);
  } catch (e) {
    console.error('[join-session] error:', e);
    return res.redirect(302, appOrigin);
  }
}
