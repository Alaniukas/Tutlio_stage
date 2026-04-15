// ─── Vercel Serverless Function: Hard Delete Session ─────────────────────────
// POST /api/delete-session
// - Tutor can delete own sessions
// - Org admin can delete sessions that belong to tutors in their organization
// - Best-effort delete from Google Calendar (DB delete must still happen)
// - If session used lesson package credits, return 1 credit (reserved -> available)

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';

function json(res: VercelResponse, status: number, body: unknown) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).send(JSON.stringify(body));
}

function getBearerToken(req: VercelRequest): string | null {
  const authHeader = (req.headers as any)?.authorization as string | undefined;
  if (!authHeader) return null;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  return m?.[1] || null;
}

async function isTutorInOrg(
  supabase: any,
  tutorId: string,
  organizationId: string
): Promise<boolean> {
  const { data: prof } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', tutorId)
    .maybeSingle();
  if ((prof as any)?.organization_id && (prof as any).organization_id === organizationId) return true;

  const { data: invite } = await supabase
    .from('tutor_invites')
    .select('organization_id')
    .eq('used_by_profile_id', tutorId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if ((invite as any)?.organization_id && (invite as any).organization_id === organizationId) return true;

  return false;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return json(res, 500, { error: 'Missing Supabase env vars' });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = getBearerToken(req);
    if (!token) return json(res, 401, { error: 'Unauthorized' });

    const { data: auth, error: authError } = await supabase.auth.getUser(token);
    const user = auth?.user;
    if (authError || !user) return json(res, 401, { error: 'Unauthorized' });

    const body = req.body || {};
    const parsedBody = typeof body === 'string' ? JSON.parse(body) : body;
    const sessionId = parsedBody?.sessionId;
    const deleteScope = (parsedBody?.deleteScope as string | undefined) || 'single'; // 'single' | 'future'
    if (!sessionId) return json(res, 400, { error: 'sessionId is required' });

    const { data: session, error: sessionErr } = await supabase
      .from('sessions')
      .select('id, tutor_id, subject_id, start_time, lesson_package_id, google_calendar_event_id, recurring_session_id')
      .eq('id', sessionId)
      .single();

    if (sessionErr || !session) {
      return json(res, 404, { error: 'Session not found' });
    }

    const tutorId = (session as any).tutor_id as string;

    // Permission: own session OR org admin for tutor's org
    let allowed = tutorId === user.id;
    if (!allowed) {
      const { data: adminRows } = await supabase
        .from('organization_admins')
        .select('organization_id')
        .eq('user_id', user.id);

      for (const row of adminRows || []) {
        const orgId = (row as any).organization_id as string | null;
        if (!orgId) continue;
        const ok = await isTutorInOrg(supabase, tutorId, orgId);
        if (ok) {
          allowed = true;
          break;
        }
      }
    }

    if (!allowed) return json(res, 403, { error: 'Forbidden' });

    const recurringId = (session as any).recurring_session_id as string | null;
    const startTime = (session as any).start_time as string;

    const sessionsToDelete: Array<{
      id: string;
      tutor_id: string;
      subject_id: string | null;
      start_time: string;
      lesson_package_id: string | null;
    }> = [];

    if (deleteScope === 'future' && recurringId) {
      const { data: rows, error: listErr } = await supabase
        .from('sessions')
        .select('id, tutor_id, subject_id, start_time, lesson_package_id')
        .eq('recurring_session_id', recurringId)
        .eq('tutor_id', tutorId)
        .gte('start_time', startTime);
      if (listErr) return json(res, 500, { error: 'Failed to load recurring sessions' });
      for (const r of rows || []) {
        const row = r as any;
        sessionsToDelete.push({
          id: String(row.id),
          tutor_id: String(row.tutor_id),
          subject_id: row.subject_id ? String(row.subject_id) : null,
          start_time: String(row.start_time),
          lesson_package_id: row.lesson_package_id ? String(row.lesson_package_id) : null,
        });
      }
      // Stop future generation
      await supabase
        .from('recurring_individual_sessions')
        .update({ active: false })
        .eq('id', recurringId);
    } else {
      sessionsToDelete.push({
        id: String((session as any).id),
        tutor_id: tutorId,
        subject_id: (session as any).subject_id ? String((session as any).subject_id) : null,
        start_time: startTime,
        lesson_package_id: (session as any).lesson_package_id ? String((session as any).lesson_package_id) : null,
      });
    }

    // If paid via package -> return credits first (avoid leaving credit stuck).
    const creditsByPackage = new Map<string, number>();
    for (const s of sessionsToDelete) {
      if (s.lesson_package_id) {
        creditsByPackage.set(s.lesson_package_id, (creditsByPackage.get(s.lesson_package_id) || 0) + 1);
      }
    }
    for (const [packageId, countToReturn] of creditsByPackage.entries()) {
      const { data: pkg, error: pkgErr } = await supabase
        .from('lesson_packages')
        .select('available_lessons, reserved_lessons')
        .eq('id', packageId)
        .maybeSingle();
      if (pkgErr || !pkg) {
        return json(res, 500, { error: 'Failed to load lesson package' });
      }
      const available = Number((pkg as any).available_lessons || 0);
      const reserved = Number((pkg as any).reserved_lessons || 0);
      const { error: updErr } = await supabase
        .from('lesson_packages')
        .update({
          available_lessons: available + countToReturn,
          reserved_lessons: Math.max(0, reserved - countToReturn),
        })
        .eq('id', packageId);
      if (updErr) return json(res, 500, { error: 'Failed to return package credit' });
    }

    // Best-effort: delete from Google Calendar BEFORE DB delete
    try {
      const { deleteSessionFromGoogle } = await import('./_lib/google-calendar');
      for (const s of sessionsToDelete.slice(0, 60)) {
        try {
          await deleteSessionFromGoogle(s.id, tutorId);
        } catch (err) {
          console.error('[delete-session] Google delete failed:', s.id, err);
        }
      }
    } catch (err) {
      console.error('[delete-session] Google delete import failed:', err);
    }

    // Hard delete from DB
    const ids = sessionsToDelete.map((s) => s.id);
    const { error: delErr } = await supabase.from('sessions').delete().in('id', ids);
    if (delErr) return json(res, 500, { error: 'Failed to delete session' });

    // Group lesson: recompute available_spots for remaining sessions at affected times
    const affectedKeys = new Map<string, { tutorId: string; subjectId: string; startTime: string }>();
    for (const s of sessionsToDelete) {
      if (s.subject_id) {
        const key = `${s.tutor_id}|${s.subject_id}|${s.start_time}`;
        affectedKeys.set(key, { tutorId: s.tutor_id, subjectId: s.subject_id, startTime: s.start_time });
      }
    }
    for (const k of affectedKeys.values()) {
      const { data: subject } = await supabase
        .from('subjects')
        .select('is_group, max_students')
        .eq('id', k.subjectId)
        .maybeSingle();
      if (!(subject as any)?.is_group) continue;
      const { data: remaining } = await supabase
        .from('sessions')
        .select('id')
        .eq('tutor_id', k.tutorId)
        .eq('start_time', k.startTime)
        .eq('subject_id', k.subjectId)
        .eq('status', 'active');
      const count = remaining?.length || 0;
      const max = Number((subject as any).max_students || 0);
      const spots = Math.max(0, max - count);
      if (remaining && remaining.length > 0) {
        await supabase
          .from('sessions')
          .update({ available_spots: spots })
          .in('id', remaining.map((r: any) => r.id));
      }
    }

    return json(res, 200, { success: true, deletedCount: sessionsToDelete.length });
  } catch (err: any) {
    console.error('[delete-session] Unhandled error:', err);
    return json(res, 500, {
      error: 'Internal server error',
      message: err?.message || String(err),
    });
  }
}
