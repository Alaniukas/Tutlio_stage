// GET /api/admin-attendance?from=YYYY-MM-DD&to=YYYY-MM-DD&only=flagged|all
// Platform admin attendance report: online lessons (with a meeting link) where
// the tutor and/or student did not click "join" within 10 min of the start.
// Flags are derived at read time from sessions.tutor_joined_at / student_joined_at.
// Requires x-admin-secret header (same pattern as admin-b2c-report).
import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { supabaseServiceRoleClientOptions } from './_lib/supabaseServiceRoleClientOptions.js';
import { deriveAttendance, ATTENDANCE_GRACE_MS } from '../src/lib/attendance.js';

function getPlatformAdminSecret(): string {
  const s = process.env.ADMIN_SECRET || process.env.VITE_ADMIN_SECRET;
  return (s && String(s).trim()) || '';
}

function secretsMatch(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, supabaseServiceRoleClientOptions() as any);
}

function parseDayBound(value: unknown, endOfDay: boolean): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const adminSecret = getPlatformAdminSecret();
  const secret = typeof req.headers['x-admin-secret'] === 'string' ? req.headers['x-admin-secret'] : '';
  if (!adminSecret || !secret || !secretsMatch(secret, adminSecret)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sb = getSupabase();
  if (!sb) return res.status(503).json({ error: 'Database not configured' });

  const now = new Date();
  const defaultFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const from = parseDayBound(req.query.from, false) || defaultFrom;
  const to = parseDayBound(req.query.to, true) || now;
  // Attendance is assessable only once the 10 min grace window has passed.
  const assessableUntil = new Date(now.getTime() - ATTENDANCE_GRACE_MS);
  const rangeEnd = to < assessableUntil ? to : assessableUntil;
  const onlyFlagged = req.query.only !== 'all';

  try {
    const { data: sessions, error } = await sb
      .from('sessions')
      .select(`
        id, start_time, end_time, status, topic, meeting_link,
        tutor_joined_at, student_joined_at,
        tutor:profiles!sessions_tutor_id_fkey(id, full_name, email, organization_id, organizations(name)),
        student:students(id, full_name, email),
        subject:subjects(name)
      `)
      .neq('status', 'cancelled')
      .not('meeting_link', 'is', null)
      .gte('start_time', from.toISOString())
      .lte('start_time', rangeEnd.toISOString())
      .order('start_time', { ascending: false })
      .limit(1000);

    if (error) {
      console.error('[admin-attendance] query error:', error);
      return res.status(500).json({ error: 'Failed to load sessions' });
    }

    let assessed = 0;
    const rows = (sessions || [])
      .map((s: any) => {
        const attendance = deriveAttendance(s, now);
        if (attendance.applicable) assessed++;
        return {
          id: s.id,
          start_time: s.start_time,
          end_time: s.end_time,
          status: s.status,
          topic: s.subject?.name || s.topic || null,
          tutor_name: s.tutor?.full_name || null,
          tutor_email: s.tutor?.email || null,
          organization_name: s.tutor?.organizations?.name || null,
          student_name: s.student?.full_name || null,
          student_email: s.student?.email || null,
          tutor_joined_at: s.tutor_joined_at,
          student_joined_at: s.student_joined_at,
          attendance,
        };
      })
      .filter((r) => r.attendance.applicable && (!onlyFlagged || r.attendance.flagged));

    return res.status(200).json({
      from: from.toISOString(),
      to: to.toISOString(),
      assessed,
      flagged: rows.filter((r) => r.attendance.flagged).length,
      rows,
    });
  } catch (e: any) {
    console.error('[admin-attendance] error:', e);
    return res.status(500).json({ error: 'Failed to build attendance report', message: e?.message });
  }
}
