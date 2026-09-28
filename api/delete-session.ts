// POST /api/delete-session: authorized calendar cleanup, including cancelled recurrences.
import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import { releaseSessionSlotAsAvailability, sessionInstantToAvailabilityFields } from './_lib/release-session-availability.js';
import type { SessionRecurrenceExclusion } from './_lib/sessionRecurrenceExclusions.js';

type DeleteScope = 'single' | 'future' | 'all';
type GroupScope = 'one_student' | 'whole_occurrence';
type SessionRow = {
  id: string;
  tutor_id: string;
  student_id: string | null;
  subject_id: string | null;
  start_time: string;
  end_time: string;
  status: string;
  lesson_package_id: string | null;
  meeting_link: string | null;
  google_calendar_event_id: string | null;
  recurring_session_id: string | null;
  class_group_id: string | null;
  student_joined_at: string | null;
  tutor_joined_at: string | null;
  cancellation_penalty_amount: number | null;
  penalty_resolution: string | null;
};
const SESSION_SELECT = 'id, tutor_id, student_id, subject_id, start_time, end_time, status, lesson_package_id, meeting_link, google_calendar_event_id, recurring_session_id, class_group_id, student_joined_at, tutor_joined_at, cancellation_penalty_amount, penalty_resolution';

function json(res: VercelResponse, status: number, body: unknown) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).send(JSON.stringify(body));
}

async function isTutorInOrg(supabase: any, tutorId: string, organizationId: string): Promise<boolean> {
  const { data: profile, error: profileError } = await supabase.from('profiles').select('organization_id').eq('id', tutorId).maybeSingle();
  if (profileError) return false;
  // An accepted invite is only a legacy fallback, never authority over a tutor
  // who has since moved to a different organization.
  if (profile?.organization_id) return profile.organization_id === organizationId;
  const { data: invite } = await supabase.from('tutor_invites').select('organization_id')
    .eq('used_by_profile_id', tutorId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  return invite?.organization_id === organizationId;
}

async function isStudentOrParent(supabase: any, userId: string, studentId: string | null): Promise<boolean> {
  if (!studentId) return false;
  const { data: student } = await supabase.from('students').select('linked_user_id, parent_user_id').eq('id', studentId).maybeSingle();
  if (student?.linked_user_id === userId || student?.parent_user_id === userId) return true;
  const { data: parent } = await supabase.from('parent_profiles').select('id').eq('user_id', userId).maybeSingle();
  if (!parent?.id) return false;
  const { data: link } = await supabase.from('parent_students').select('id')
    .eq('parent_id', parent.id).eq('student_id', studentId).maybeSingle();
  return Boolean(link);
}

function hasUnsettledPenalty(session: SessionRow): boolean {
  return session.penalty_resolution === 'pending' || session.penalty_resolution === 'invoiced';
}

function isCancellationProcessing(session: SessionRow): boolean {
  return session.status === 'cancelled' && session.penalty_resolution === 'pending'
    && session.cancellation_penalty_amount === null;
}

/** Completed/attended history stays intact when removing the remaining schedule. */
function isRemainingPlannedSession(session: SessionRow, nowMs: number): boolean {
  if (isCancellationProcessing(session)) return false;
  return session.status === 'cancelled' || (
    session.status === 'active'
    && Date.parse(session.start_time) > nowMs
    && !session.student_joined_at
    && !session.tutor_joined_at
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return json(res, 500, { error: 'Missing Supabase env vars' });
    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const authorization = req.headers.authorization;
    const token = typeof authorization === 'string' ? authorization.match(/^Bearer\s+(.+)$/i)?.[1] : null;
    if (!token) return json(res, 401, { error: 'Unauthorized' });
    const { data: auth, error: authError } = await supabase.auth.getUser(token);
    if (authError || !auth?.user) return json(res, 401, { error: 'Unauthorized' });

    let body: Record<string, unknown>;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
    catch { return json(res, 400, { error: 'Invalid JSON body' }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error: 'Invalid request body' });
    const sessionId = body.sessionId;
    if (typeof sessionId !== 'string' || !sessionId) return json(res, 400, { error: 'sessionId is required' });
    if (body.deleteScope !== undefined && !['single', 'future', 'all'].includes(String(body.deleteScope))) {
      return json(res, 400, { error: 'Invalid deleteScope' });
    }
    if (body.groupScope !== undefined && !['one_student', 'whole_occurrence'].includes(String(body.groupScope))) {
      return json(res, 400, { error: 'Invalid groupScope' });
    }
    const scope = (body.deleteScope || 'single') as DeleteScope;
    const groupScope = (body.groupScope || 'one_student') as GroupScope;
    const { data: loaded, error: sessionError } = await supabase.from('sessions').select(SESSION_SELECT).eq('id', sessionId).maybeSingle();
    if (sessionError || !loaded) return json(res, 404, { error: 'Session not found' });
    const session = loaded as SessionRow;
    const userId = auth.user.id;

    let canManage = session.tutor_id === userId;
    let adminAccess: Awaited<ReturnType<typeof getOrgAdminAccessByUserId>> = null;
    if (!canManage) {
      adminAccess = await getOrgAdminAccessByUserId(supabase, userId);
      canManage = Boolean(adminAccess && hasOrgAdminPermission(adminAccess.role, adminAccess.permissions, 'sessions.edit')
        && await isTutorInOrg(supabase, session.tutor_id, adminAccess.organizationId));
    }
    const familyOnly = !canManage;
    if (familyOnly && !await isStudentOrParent(supabase, userId, session.student_id)) {
      return json(res, 403, { error: 'Forbidden' });
    }
    if (familyOnly && session.status !== 'cancelled') {
      return json(res, 403, { error: 'Only cancelled lessons can be deleted by students or parents' });
    }
    if (scope === 'single' && isCancellationProcessing(session)) {
      return json(res, 409, { error: 'Cancellation is still being processed; try again shortly', code: 'cancellation_in_progress' });
    }
    if (familyOnly && hasUnsettledPenalty(session)) {
      return json(res, 409, { error: 'This lesson has an unsettled cancellation charge', code: 'unsettled_cancellation_charge' });
    }
    const recurring = Boolean(session.recurring_session_id || session.class_group_id);
    if (recurring && body.deleteScope === undefined) {
      return json(res, 409, { error: 'Choose whether to delete this lesson or the recurring series', code: 'recurring_scope_required' });
    }

    let sessionsToDelete = [session];
    const allowedTutorIds = new Set([session.tutor_id]);
    const wholeGroupOccurrence = Boolean(session.class_group_id && groupScope === 'whole_occurrence' && !familyOnly);
    if (session.class_group_id && !familyOnly) {
      const { data: group, error } = await supabase.from('school_class_groups').select('tutor_id, organization_id')
        .eq('id', session.class_group_id).maybeSingle();
      if (error || !group) return json(res, 409, { error: 'The recurring group has changed; refresh the calendar' });
      if (group.tutor_id !== userId) {
        adminAccess ??= await getOrgAdminAccessByUserId(supabase, userId);
        if (!adminAccess || adminAccess.organizationId !== group.organization_id
          || !hasOrgAdminPermission(adminAccess.role, adminAccess.permissions, 'sessions.edit')) {
          return json(res, 403, { error: 'Forbidden' });
        }
        if (!await isTutorInOrg(supabase, group.tutor_id, adminAccess.organizationId)) {
          return json(res, 403, { error: 'Forbidden' });
        }
      }
      allowedTutorIds.add(group.tutor_id);
    }
    if (recurring && (scope !== 'single' || wholeGroupOccurrence)) {
      const rows: SessionRow[] = [];
      // A group can have more than Supabase's default 1000-row response cap.
      for (let offset = 0; ; offset += 500) {
        let query = supabase.from('sessions').select(SESSION_SELECT);
        if (session.class_group_id) query = query.eq('class_group_id', session.class_group_id);
        else query = query.eq('recurring_session_id', session.recurring_session_id!).eq('tutor_id', session.tutor_id).eq('student_id', session.student_id!);
        if (scope === 'future') query = query.gte('start_time', session.start_time);
        if (scope === 'single') query = query.eq('start_time', session.start_time);
        // A family may remove only its child's cancelled rows, never other members.
        if (session.class_group_id && !wholeGroupOccurrence) query = query.eq('student_id', session.student_id!);
        if (familyOnly) query = query.eq('student_id', session.student_id!).eq('status', 'cancelled');
        const { data: page, error } = await query.order('start_time', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 499);
        if (error) return json(res, 500, { error: 'Failed to load recurring lessons' });
        rows.push(...((page || []) as SessionRow[]));
        if (!page || page.length < 500) break;
      }
      const nowMs = Date.now();
      sessionsToDelete = rows.filter((row) => familyOnly
        ? row.status === 'cancelled' && !hasUnsettledPenalty(row)
        : !isCancellationProcessing(row) && (scope === 'single' || isRemainingPlannedSession(row, nowMs)));
      // A group's teacher can change during the year. An old teacher cannot
      // remove another teacher's rows merely by sharing the class_group_id.
      if (!familyOnly) {
        for (const tutorId of new Set(sessionsToDelete.map((row) => row.tutor_id))) {
          if (tutorId === userId) { allowedTutorIds.add(tutorId); continue; }
          adminAccess ??= await getOrgAdminAccessByUserId(supabase, userId);
          if (!adminAccess || !hasOrgAdminPermission(adminAccess.role, adminAccess.permissions, 'sessions.edit')
            || !await isTutorInOrg(supabase, tutorId, adminAccess.organizationId)) {
            return json(res, 403, { error: 'Forbidden' });
          }
          allowedTutorIds.add(tutorId);
        }
      }
    }
    if (sessionsToDelete.length === 0) {
      return json(res, 409, { error: 'No planned or cancelled lessons remain in this selection', code: 'no_deletable_sessions' });
    }
    const ids = sessionsToDelete.map((row) => row.id);
    const exclusions: SessionRecurrenceExclusion[] = [];
    if (session.class_group_id && !familyOnly && scope !== 'single') {
      exclusions.push({ recurring_session_id: null, class_group_id: session.class_group_id,
        student_id: wholeGroupOccurrence ? null : session.student_id,
        scope, start_time: scope === 'future' ? session.start_time : null });
    } else if (wholeGroupOccurrence) {
      exclusions.push({ recurring_session_id: null, class_group_id: session.class_group_id,
        student_id: null, scope: 'single', start_time: session.start_time });
    } else if (session.recurring_session_id && !familyOnly && scope !== 'single') {
      // Also blocks a cron that read the template immediately before it was deactivated.
      exclusions.push({ recurring_session_id: session.recurring_session_id, class_group_id: null,
        student_id: session.student_id, scope, start_time: scope === 'future' ? session.start_time : null });
    } else {
      for (const row of sessionsToDelete) {
        if (!row.recurring_session_id && !row.class_group_id) continue;
        exclusions.push({ recurring_session_id: row.class_group_id ? null : row.recurring_session_id,
          class_group_id: row.class_group_id, student_id: row.student_id, scope: 'single', start_time: row.start_time });
      }
    }

    // Availability is prepared while the chosen sessions still exist. Their ids are
    // ignored only for this restoration; booking conflict checks still see them if
    // the following atomic deletion fails, so the operation can be retried safely.
    const restoredSlots = new Set<string>();
    const restoreSlots = async (rows: SessionRow[], ignoredSessionIds: string[]) => {
      const byDate = new Map<string, SessionRow[]>();
      for (const row of rows) {
        const slotKey = `${row.tutor_id}|${row.start_time}|${row.end_time}`;
        if (restoredSlots.has(slotKey)) continue;
        restoredSlots.add(slotKey);
        const { specificDate } = sessionInstantToAvailabilityFields(row.start_time, row.end_time);
        const key = `${row.tutor_id}|${specificDate}`;
        const dateRows = byDate.get(key) || [];
        dateRows.push(row);
        byDate.set(key, dateRows);
      }
      const batches = [...byDate.values()];
      let nextBatch = 0;
      const workers = Array.from({ length: Math.min(6, batches.length) }, async () => {
        while (nextBatch < batches.length) {
          const batch = batches[nextBatch++]!;
          // Within one teacher/day these read-insert operations stay sequential.
          for (const row of batch) {
            await releaseSessionSlotAsAvailability(supabase, { tutorId: row.tutor_id, startTime: row.start_time,
              endTime: row.end_time, subjectId: row.subject_id, meetingLink: row.meeting_link, ignoredSessionIds });
          }
        }
      });
      const outcomes = await Promise.allSettled(workers);
      const failed = outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected');
      if (failed) throw failed.reason;
    };
    await restoreSlots(sessionsToDelete, ids);

    // One transaction persists exclusions, stops generation, returns only reserved
    // package credits and removes rows. Cancelled credits were already handled by
    // cancellation; a retry/concurrent delete cannot refund them a second time.
    const { data: deleted, error: deleteError } = await supabase.rpc('delete_sessions_with_recurrence', {
      p_session_ids: ids, p_exclusions: exclusions,
      p_deactivate_recurring_ids: !familyOnly && scope !== 'single' && session.recurring_session_id && !session.class_group_id
        ? [session.recurring_session_id] : [],
      p_family_only: familyOnly, p_protect_history: scope !== 'single',
      p_allowed_tutor_ids: [...allowedTutorIds],
      p_family_student_id: familyOnly ? session.student_id : null,
    });
    if (deleteError) {
      if (deleteError.code === 'PGRST202' || deleteError.code === '42883' || deleteError.code === '42P01') {
        return json(res, 503, { error: 'Lesson deletion is temporarily unavailable', code: 'session_delete_migration_required' });
      }
      if (deleteError.code === 'P0001' && deleteError.message?.includes('Cancellation is still being processed')) {
        return json(res, 409, { error: 'Cancellation is still being processed; try again shortly', code: 'cancellation_in_progress' });
      }
      return json(res, deleteError.code === 'P0001' ? 409 : 500, { error: 'Failed to delete lessons', code: 'session_delete_failed' });
    }
    if (!Array.isArray(deleted)) return json(res, 500, { error: 'Failed to confirm lesson deletion' });
    const deletedRows = deleted as SessionRow[];
    const deletedIds = deletedRows.map((row) => row.id);
    // The transaction can also include rows generated during the preceding read.
    let availabilityRestoreFailed = false;
    try { await restoreSlots(deletedRows, deletedIds); }
    catch (error) {
      // These are only extra rows generated during the read; the original slots
      // were restored before deletion. Still report the successful deletion so
      // clients discard the real deleted ids and Google cleanup can proceed.
      availabilityRestoreFailed = true;
      console.error('[delete-session] Additional availability restoration failed:', error);
    }
    try {
      const { deleteSessionFromGoogle } = await import('./_lib/google-calendar.js');
      for (const row of deletedRows) {
        try { await deleteSessionFromGoogle(row.id, row.tutor_id, row.google_calendar_event_id ?? null); }
        catch (error) { console.error('[delete-session] Google delete failed:', row.id, error); }
      }
    } catch (error) { console.error('[delete-session] Google delete failed:', error); }
    return json(res, 200, { success: true, deletedCount: deletedIds.length, deletedSessionIds: deletedIds,
      ...(availabilityRestoreFailed ? { availabilityRestoreFailed: true } : {}) });
  } catch (error) {
    console.error('[delete-session] Unhandled error:', error);
    return json(res, 500, { error: 'Internal server error' });
  }
}
