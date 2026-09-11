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
import { removeGeneratedNoShowTutorComment } from '../src/lib/noShowWhen.js';

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
      .select('id, tutor_id, student_id, status, start_time, end_time, lesson_package_id, subject_id, status_confirmed_at, tutor_comment')
      .eq('id', sessionId)
      .maybeSingle();
    if (!session) return json(res, 404, { error: 'Session not found' });

    // Actor: the session's tutor, or an admin of the tutor's organization.
    const [adminRow, { data: tutorRow }] = await Promise.all([
      getOrgAdminAccessByUserId(supabase, userId),
      session.tutor_id
        ? supabase.from('profiles').select('organization_id').eq('id', session.tutor_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const tutorOrganizationId = (tutorRow as { organization_id?: string | null } | null)?.organization_id || null;
    const isOrgAdminActor = Boolean(
      adminRow &&
        tutorOrganizationId &&
        adminRow.organizationId === tutorOrganizationId &&
        hasOrgAdminPermission(adminRow.role, adminRow.permissions, 'sessions.edit'),
    );
    const authorized = session.tutor_id === userId || isOrgAdminActor;
    if (!authorized) return json(res, 403, { error: 'Not authorized to confirm this session' });

    if (status === 'cancelled' && session.tutor_id === userId) {
      if (tutorOrganizationId && isProKlaseOrg(tutorOrganizationId)) {
        if (
          !adminRow
          || adminRow.organizationId !== tutorOrganizationId
          || !hasOrgAdminPermission(adminRow.role, adminRow.permissions, 'sessions.edit')
        ) {
          return json(res, 403, { error: 'Only administration can cancel lessons for this organization' });
        }
      }
    }

    const sessionEnd = Date.parse(session.end_time || '');
    if (!Number.isFinite(sessionEnd) || sessionEnd > Date.now()) {
      return json(res, 409, { error: 'lesson_not_ended' });
    }

    // Schools may attest and correct older outcomes because join-link tracking
    // is only a signal, not proof of attendance. Pro Klasė keeps the stricter
    // admin-only correction policy. Corrections do not repeat an already stamped
    // package transition; legacy unstamped no-shows are repaired below.
    const existingFinalOutcome = session.status !== 'active' && ['completed', 'no_show'].includes(session.status);
    let organizationEntityType: string | null = null;
    if (existingFinalOutcome && tutorOrganizationId) {
      const { data: org } = await supabase
        .from('organizations')
        .select('entity_type')
        .eq('id', tutorOrganizationId)
        .maybeSingle();
      organizationEntityType = org?.entity_type || null;
    }
    const evidenceOnly = existingFinalOutcome && req.body?.confirmExisting === true
      && status === session.status && ['completed', 'no_show'].includes(status)
      && (organizationEntityType === 'school' || (isOrgAdminActor && isProKlaseOrg(tutorOrganizationId)));
    const correction = existingFinalOutcome && req.body?.correctExisting === true
      && status !== session.status && ['completed', 'no_show'].includes(status)
      && (
        (organizationEntityType === 'school' && authorized)
        || (isOrgAdminActor && isProKlaseOrg(tutorOrganizationId))
      );
    if (session.status !== 'active' && !evidenceOnly && !correction) {
      return json(res, 409, { error: 'already_finalized', currentStatus: session.status });
    }
    if (evidenceOnly) {
      if (session.status_confirmed_at) return json(res, 200, { success: true, sessionId, status, alreadyConfirmed: true, statusConfirmedAt: session.status_confirmed_at });
    }

    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status,
      status_confirmed_at: nowIso,
      status_confirmed_by: userId,
    };
    if (!evidenceOnly && status === 'completed') {
      patch.completed_late = late;
      patch.no_show_when = null;
      patch.no_show_reason = null;
      if (correction) {
        patch.tutor_comment = removeGeneratedNoShowTutorComment(session.tutor_comment);
      }
    } else if (!evidenceOnly && status === 'no_show') {
      const when = String(req.body?.noShowWhen || 'after_lesson');
      patch.no_show_when = NO_SHOW_WHEN.has(when) ? when : 'after_lesson';
      patch.no_show_reason = null;
    } else if (status === 'cancelled') {
      patch.cancelled_by = 'tutor';
    }

    let update = supabase.from('sessions').update(patch).eq('id', sessionId).eq('status', session.status);
    if (evidenceOnly) update = update.is('status_confirmed_at', null);
    const { data: updated, error: updateErr } = await update.select('id').maybeSingle();
    if (updateErr) {
      return json(res, 500, { error: 'Update failed', details: updateErr.message });
    }
    if (!updated) {
      // PostgREST can reapply the pre-update filter to its returned rows.
      // Verify this exact write before treating an empty representation as a race.
      const { data: saved, error: readError } = await supabase.from('sessions')
        .select('status,status_confirmed_at,status_confirmed_by').eq('id', sessionId).maybeSingle();
      if (readError) return json(res, 500, { error: 'Confirmation verification failed' });
      if (saved?.status !== status || saved?.status_confirmed_by !== userId
          || Date.parse(saved?.status_confirmed_at || '') !== Date.parse(nowIso)) {
        return json(res, 409, { error: 'session_changed_retry' });
      }
    }

    // Package counters: occurred lessons (completed / no_show) consume the reserved
    // lesson; a post-end cancellation returns it to the package.
    try {
      if (evidenceOnly) {
        // This is an attestation of existing history, not a new status transition.
      } else if (correction) {
        // Old direct no-show writes did not settle package counters. A stamped
        // outcome already did, so only repair the legacy unstamped transition.
        if (session.status === 'no_show' && !session.status_confirmed_at) {
          await movePackageCountersToCompleted(supabase, [session as any]);
          await deleteSessionWaitlists(supabase, [sessionId]);
        }
      } else if (status === 'cancelled') {
        await returnPackageCounterToAvailable(supabase, session as any);
      } else {
        await movePackageCountersToCompleted(supabase, [session as any]);
      }
      if (!evidenceOnly && !correction) await deleteSessionWaitlists(supabase, [sessionId]);
    } catch (sideErr) {
      console.error('[confirm-session-status] side effects failed:', sideErr);
    }

    if (session.tutor_id && !evidenceOnly) {
      syncSessionToGoogle(sessionId, session.tutor_id).catch(() => {});
    }

    return json(res, 200, {
      success: true,
      sessionId,
      status,
      completedLate: status === 'completed' ? late : false,
      corrected: correction,
      statusConfirmedAt: nowIso,
    });
  } catch (err: any) {
    console.error('[confirm-session-status] error:', err?.message || err);
    return json(res, 500, { error: 'Internal server error' });
  }
}
