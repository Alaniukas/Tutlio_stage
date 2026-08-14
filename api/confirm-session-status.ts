// Tutor (or org admin) confirms the outcome of an ended lesson — used by orgs
// with the tutor_lesson_status_confirmation feature, whose lessons the
// auto-complete cron intentionally skips.
//
// POST { sessionId, status: 'completed' | 'no_show' | 'cancelled', late?, noShowWhen? }
//   completed + late=true  → status 'completed' with completed_late (įvyko, bet vėlavo)
//   no_show                → status 'no_show' (consumes a package lesson, like completed)
//   cancelled              → status 'cancelled' by tutor (package lesson returned)

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { syncSessionToGoogle } from './_lib/google-calendar.js';
import {
  movePackageCountersToCompleted,
  returnPackageCounterToAvailable,
  deleteSessionWaitlists,
} from './_lib/sessionStatusConfirmation.js';
import { isProKlaseOrg } from './_lib/marketMoney.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';

const NO_SHOW_WHEN = new Set(['before_lesson', 'during_lesson', 'after_lesson']);

function json(res: VercelResponse, status: number, body: Record<string, unknown>) {
  return res.status(status).json(body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return json(res, 500, { error: 'Missing Supabase env vars' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return json(res, 401, { error: 'Unauthorized' });
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
    const userId = authData.user.id;

    const sessionId = String(req.body?.sessionId || '').trim();
    const status = String(req.body?.status || '').trim();
    const late = req.body?.late === true;
    if (!sessionId) return json(res, 400, { error: 'Missing sessionId' });
    if (!['completed', 'no_show', 'cancelled'].includes(status)) {
      return json(res, 400, { error: 'Invalid status' });
    }
    if (late && status !== 'completed') {
      return json(res, 400, { error: 'late is only valid with status=completed' });
    }

    const { data: session } = await supabase
      .from('sessions')
      .select('id, tutor_id, student_id, status, start_time, end_time, lesson_package_id, subject_id')
      .eq('id', sessionId)
      .maybeSingle();
    if (!session) return json(res, 404, { error: 'Session not found' });

    // Actor: the session's tutor, or an admin of the tutor's organization.
    let authorized = session.tutor_id === userId;
    if (!authorized && session.tutor_id) {
      const [adminRow, { data: tutorRow }] = await Promise.all([
        getOrgAdminAccessByUserId(supabase, userId),
        supabase.from('profiles').select('organization_id').eq('id', session.tutor_id).maybeSingle(),
      ]);
      authorized = Boolean(
        adminRow &&
          tutorRow?.organization_id &&
          adminRow.organizationId === tutorRow.organization_id &&
          hasOrgAdminPermission(adminRow.role, adminRow.permissions, 'sessions.edit'),
      );
    }
    if (!authorized) return json(res, 403, { error: 'Not authorized to confirm this session' });

    if (status === 'cancelled' && session.tutor_id === userId) {
      const { data: tutorRow } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', userId)
        .maybeSingle();
      const orgId = (tutorRow as any)?.organization_id as string | null;
      if (orgId && isProKlaseOrg(orgId)) {
        const adminRow = await getOrgAdminAccessByUserId(supabase, userId);
        if (
          !adminRow
          || adminRow.organizationId !== orgId
          || !hasOrgAdminPermission(adminRow.role, adminRow.permissions, 'sessions.edit')
        ) {
          return json(res, 403, { error: 'Only administration can cancel lessons for this organization' });
        }
      }
    }

    if (session.status !== 'active') {
      return json(res, 409, { error: 'already_finalized', currentStatus: session.status });
    }
    if (new Date(session.end_time).getTime() > Date.now()) {
      return json(res, 409, { error: 'lesson_not_ended' });
    }

    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status,
      status_confirmed_at: nowIso,
      status_confirmed_by: userId,
    };
    if (status === 'completed') {
      patch.completed_late = late;
      patch.no_show_when = null;
    } else if (status === 'no_show') {
      const when = String(req.body?.noShowWhen || 'after_lesson');
      patch.no_show_when = NO_SHOW_WHEN.has(when) ? when : 'after_lesson';
    } else if (status === 'cancelled') {
      patch.cancelled_by = 'tutor';
    }

    const { error: updateErr } = await supabase.from('sessions').update(patch).eq('id', sessionId);
    if (updateErr) {
      return json(res, 500, { error: 'Update failed', details: updateErr.message });
    }

    // Package counters: occurred lessons (completed / no_show) consume the reserved
    // lesson; a post-end cancellation returns it to the package.
    try {
      if (status === 'cancelled') {
        await returnPackageCounterToAvailable(supabase, session as any);
      } else {
        await movePackageCountersToCompleted(supabase, [session as any]);
      }
      await deleteSessionWaitlists(supabase, [sessionId]);
    } catch (sideErr) {
      console.error('[confirm-session-status] side effects failed:', sideErr);
    }

    if (session.tutor_id) {
      syncSessionToGoogle(sessionId, session.tutor_id).catch(() => {});
    }

    return json(res, 200, {
      success: true,
      sessionId,
      status,
      completedLate: status === 'completed' ? late : false,
      statusConfirmedAt: nowIso,
    });
  } catch (err: any) {
    console.error('[confirm-session-status] error:', err?.message || err);
    return json(res, 500, { error: 'Internal server error' });
  }
}
