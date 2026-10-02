// POST /api/remind-tutor-session-status — org admin nudges a Pro Klasė tutor to
// confirm ended lesson outcomes. Reuses the lesson_status_confirmation_reminder
// email template (same as the daily cron digest).

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import { isProKlaseOrg } from './_lib/marketMoney.js';
import { isProKlaseAwaitingOutcomeConfirmation } from '../src/lib/proKlaseTutorPay.js';

const MANUAL_REMINDER_COOLDOWN_MS = 60 * 60 * 1000;

function json(res: VercelResponse, status: number, body: Record<string, unknown>) {
  return res.status(status).json(body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return json(res, 500, { error: 'Missing Supabase env vars' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return json(res, 401, { error: 'Unauthorized' });
  }

  const sessionId = String(req.body?.sessionId || '').trim();
  if (!sessionId) {
    return json(res, 400, { error: 'Missing sessionId' });
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: authData, error: authErr } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', ''),
  );
  if (authErr || !authData?.user) {
    return json(res, 401, { error: 'Unauthorized' });
  }

  const adminAccess = await getOrgAdminAccessByUserId(supabase, authData.user.id);
  if (!adminAccess || !hasOrgAdminPermission(adminAccess.role, adminAccess.permissions, 'sessions.edit')) {
    return json(res, 403, { error: 'Forbidden' });
  }
  if (!isProKlaseOrg(adminAccess.organizationId)) {
    return json(res, 403, { error: 'Only Pro Klasė administrators can send this reminder' });
  }

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('id, tutor_id, student_id, start_time, end_time, status, status_confirmed_at, status_reminder_last_sent_at')
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionError) {
    return json(res, 500, { error: 'Database error', details: sessionError.message });
  }
  if (!session?.tutor_id) {
    return json(res, 404, { error: 'Session not found' });
  }

  const now = new Date();
  if (!isProKlaseAwaitingOutcomeConfirmation(session, now)) {
    return json(res, 409, { error: 'Session no longer needs outcome confirmation' });
  }

  const lastSentMs = session.status_reminder_last_sent_at
    ? Date.parse(session.status_reminder_last_sent_at)
    : 0;
  if (Number.isFinite(lastSentMs) && now.getTime() - lastSentMs < MANUAL_REMINDER_COOLDOWN_MS) {
    return json(res, 429, { error: 'reminder_cooldown' });
  }

  const { data: tutor, error: tutorError } = await supabase
    .from('profiles')
    .select('id, full_name, email, preferred_locale, organization_id')
    .eq('id', session.tutor_id)
    .maybeSingle();
  if (tutorError) {
    return json(res, 500, { error: 'Database error', details: tutorError.message });
  }
  if (!tutor || tutor.organization_id !== adminAccess.organizationId) {
    return json(res, 403, { error: 'Forbidden' });
  }
  if (!tutor.email) {
    return json(res, 409, { error: 'Tutor has no email address' });
  }

  const lookback = new Date(now.getTime() - 30 * 24 * 3_600_000).toISOString();
  const { data: pendingRows, error: pendingError } = await supabase
    .from('sessions')
    .select('id, student_id, start_time, end_time, status, status_confirmed_at')
    .eq('tutor_id', tutor.id)
    .is('status_confirmed_at', null)
    .neq('status', 'cancelled')
    .lt('end_time', now.toISOString())
    .gte('end_time', lookback)
    .order('end_time', { ascending: false })
    .limit(50);
  if (pendingError) {
    return json(res, 500, { error: 'Database error', details: pendingError.message });
  }

  const tutorSessions = (pendingRows ?? []).filter((row) =>
    isProKlaseAwaitingOutcomeConfirmation(row, now),
  );
  if (tutorSessions.length === 0) {
    return json(res, 409, { error: 'Session no longer needs outcome confirmation' });
  }

  const studentIds = [...new Set(tutorSessions.map((row) => row.student_id).filter(Boolean))] as string[];
  const { data: studentRows } = studentIds.length
    ? await supabase.from('students').select('id, full_name').in('id', studentIds)
    : { data: [] as Array<{ id: string; full_name?: string | null }> };
  const studentNameById = new Map(
    (studentRows ?? []).map((row) => [row.id, row.full_name || ''] as const),
  );

  const { data: orgRow } = await supabase
    .from('organizations')
    .select('preferred_locale')
    .eq('id', tutor.organization_id)
    .maybeSingle();
  const locale =
    (tutor.preferred_locale || '').trim() ||
    (orgRow?.preferred_locale || '').trim() ||
    'lt';
  const tz = 'Europe/Vilnius';
  const lessons = tutorSessions.slice(0, 15).map((row) => {
    const start = new Date(row.start_time);
    return {
      date: start.toLocaleDateString('lt-LT', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: tz }),
      time: start.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit', timeZone: tz }),
      student: row.student_id ? studentNameById.get(row.student_id) || '' : '',
    };
  });

  const apiUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:3002');
  const emailResp = await fetch(`${apiUrl}/api/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': serviceKey,
    },
    body: JSON.stringify({
      type: 'lesson_status_confirmation_reminder',
      to: tutor.email,
      locale,
      data: {
        tutorName: tutor.full_name || '',
        count: tutorSessions.length,
        lessons,
        organizationId: tutor.organization_id,
      },
    }),
  });
  if (!emailResp.ok) {
    const details = await emailResp.text().catch(() => '');
    console.error('[remind-tutor-session-status] send-email failed', emailResp.status, details);
    return json(res, 502, { error: 'Failed to send reminder email' });
  }

  const remindedIds = tutorSessions.map((row) => row.id);
  const stamp = now.toISOString();
  const { error: stampError } = await supabase
    .from('sessions')
    .update({ status_reminder_last_sent_at: stamp })
    .in('id', remindedIds);
  if (stampError) {
    console.error('[remind-tutor-session-status] stamp error:', stampError);
  }

  return json(res, 200, {
    success: true,
    remindedSessionCount: remindedIds.length,
    remindedAt: stamp,
  });
}
