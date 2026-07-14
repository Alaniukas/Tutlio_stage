// ─── Cron (fan-out from /api/send-reminders): lesson status confirmation nags ──
// Orgs with tutor_lesson_status_confirmation: ended lessons stay 'active' until
// the tutor confirms the outcome. This job emails each tutor a digest of their
// unconfirmed lessons, repeating ~daily until every lesson is confirmed.

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { requireCronAuth } from './_lib/cronAuth.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const API_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : (process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt');

/** First nag ≥ 45 min after the lesson ends; then repeat roughly daily. */
const MIN_MINUTES_AFTER_END = 45;
const REPEAT_HOURS = 20;
const LOOKBACK_DAYS = 30;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireCronAuth(req, res)) return;

  try {
    const now = Date.now();

    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, preferred_locale, features')
      .filter('features->>tutor_lesson_status_confirmation', 'eq', 'true');
    const flaggedOrgs = (orgs ?? []) as Array<{ id: string; preferred_locale?: string | null }>;
    if (flaggedOrgs.length === 0) {
      return res.status(200).json({ success: true, remindersSent: 0 });
    }
    const orgLocaleById = new Map(flaggedOrgs.map((o) => [o.id, (o.preferred_locale || '').trim() || null]));

    const { data: tutors } = await supabase
      .from('profiles')
      .select('id, full_name, email, preferred_locale, organization_id')
      .in('organization_id', flaggedOrgs.map((o) => o.id));
    const tutorById = new Map(
      ((tutors ?? []) as Array<{ id: string; full_name?: string | null; email?: string | null; preferred_locale?: string | null; organization_id: string }>).map(
        (t) => [t.id, t],
      ),
    );
    if (tutorById.size === 0) {
      return res.status(200).json({ success: true, remindersSent: 0 });
    }

    const endBefore = new Date(now - MIN_MINUTES_AFTER_END * 60_000).toISOString();
    const endAfter = new Date(now - LOOKBACK_DAYS * 24 * 3_600_000).toISOString();
    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('id, tutor_id, student_id, start_time, end_time, status_reminder_last_sent_at')
      .eq('status', 'active')
      .lt('end_time', endBefore)
      .gte('end_time', endAfter)
      .in('tutor_id', [...tutorById.keys()])
      .order('end_time', { ascending: false })
      .limit(500);
    if (error) {
      console.error('[lesson-status-confirmation-reminders] query error:', error);
      return res.status(500).json({ error: 'Database error', details: error.message });
    }
    const pending = (sessions ?? []) as Array<{
      id: string;
      tutor_id: string;
      student_id: string | null;
      start_time: string;
      end_time: string;
      status_reminder_last_sent_at: string | null;
    }>;
    if (pending.length === 0) {
      return res.status(200).json({ success: true, remindersSent: 0 });
    }

    // Only nag a tutor when at least one of their pending lessons is due another
    // reminder; the digest then covers ALL their pending lessons.
    const repeatCutoff = now - REPEAT_HOURS * 3_600_000;
    const byTutor = new Map<string, typeof pending>();
    for (const s of pending) {
      const arr = byTutor.get(s.tutor_id) || [];
      arr.push(s);
      byTutor.set(s.tutor_id, arr);
    }

    const studentIds = [...new Set(pending.map((s) => s.student_id).filter(Boolean))] as string[];
    const { data: studentRows } = studentIds.length
      ? await supabase.from('students').select('id, full_name').in('id', studentIds)
      : { data: [] as any[] };
    const studentNameById = new Map(
      ((studentRows ?? []) as Array<{ id: string; full_name?: string | null }>).map((s) => [s.id, s.full_name || '']),
    );

    const cronSecret = process.env.CRON_SECRET || '';
    const internalKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
    let remindersSent = 0;
    const remindedSessionIds: string[] = [];

    for (const [tutorId, tutorSessions] of byTutor) {
      const tutor = tutorById.get(tutorId);
      if (!tutor?.email) continue;
      const due = tutorSessions.some((s) => {
        const last = s.status_reminder_last_sent_at ? new Date(s.status_reminder_last_sent_at).getTime() : 0;
        return last < repeatCutoff;
      });
      if (!due) continue;

      const locale =
        (tutor.preferred_locale || '').trim() ||
        orgLocaleById.get(tutor.organization_id) ||
        'lt';
      const tz = 'Europe/Vilnius';
      const lessons = tutorSessions.slice(0, 15).map((s) => {
        const start = new Date(s.start_time);
        return {
          date: start.toLocaleDateString('lt-LT', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: tz }),
          time: start.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit', timeZone: tz }),
          student: s.student_id ? studentNameById.get(s.student_id) || '' : '',
        };
      });

      try {
        const resp = await fetch(`${API_URL}/api/send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-key': internalKey,
            ...(cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {}),
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
        if (resp.ok) {
          remindersSent += 1;
          remindedSessionIds.push(...tutorSessions.map((s) => s.id));
        } else {
          console.error('[lesson-status-confirmation-reminders] send failed:', tutor.email, resp.status);
        }
      } catch (e) {
        console.error('[lesson-status-confirmation-reminders] send error:', tutor.email, e);
      }
    }

    if (remindedSessionIds.length > 0) {
      const { error: stampErr } = await supabase
        .from('sessions')
        .update({ status_reminder_last_sent_at: new Date(now).toISOString() })
        .in('id', remindedSessionIds);
      if (stampErr) {
        console.error('[lesson-status-confirmation-reminders] stamp error:', stampErr);
      }
    }

    return res.status(200).json({
      success: true,
      remindersSent,
      pendingSessions: pending.length,
    });
  } catch (err: any) {
    console.error('[lesson-status-confirmation-reminders] error:', err?.message || err);
    return res.status(500).json({ error: 'Internal server error', message: err?.message });
  }
}
