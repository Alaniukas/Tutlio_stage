/** Missing tracked joins are review signals; people confirm the final outcome. */
import { ATTENDANCE_GRACE_MS, deriveAttendance, type AttendanceSessionLike } from './attendance.js';

export const NO_SHOW_REASON_MISSED_JOIN = 'missed_join';

export function isUnconfirmedAutomaticNoShow(session: {
  status?: string | null;
  no_show_reason?: string | null;
  status_confirmed_at?: string | null;
}): boolean {
  return session.status === 'no_show'
    && session.no_show_reason === NO_SHOW_REASON_MISSED_JOIN
    && !session.status_confirmed_at;
}

export function shouldRestoreAutomaticNoShowOnJoin(session: {
  status?: string | null;
  no_show_reason?: string | null;
  status_confirmed_at?: string | null;
}): boolean {
  return isUnconfirmedAutomaticNoShow(session);
}

export type JoinNoShowSession = AttendanceSessionLike & {
  id: string;
  meeting_link?: string | null;
  status?: string | null;
  student_joined_at?: string | null;
  tutor_joined_at?: string | null;
  end_time?: string | null;
};

/**
 * Student attendance needs human review when:
 * - online lesson (meeting_link)
 * - still active
 * - grace window passed
 * - student never clicked join
 * - tutor DID join (otherwise the lesson likely did not happen — PDF 4.5)
 */
export function shouldReviewStudentAttendanceFromMissingJoin(
  session: JoinNoShowSession,
  now: Date = new Date(),
): boolean {
  if (!(session.meeting_link || '').trim()) return false;
  if (session.status !== 'active') return false;
  if (session.student_joined_at) return false;
  const info = deriveAttendance(session, now);
  if (!info.applicable) return false;
  if (info.student !== 'missing') return false;
  if (info.tutor === 'missing' || info.tutor === 'pending') return false;
  const startMs = Date.parse(session.start_time);
  return Number.isFinite(startMs) && now.getTime() > startMs + ATTENDANCE_GRACE_MS;
}

export function orgHasJoinNoShow(features: Record<string, unknown> | null | undefined): boolean {
  return features?.school_join_no_show === true;
}
