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

/**
 * Actionable unconfirmed attendance: the system saw that the child did not join
 * an online lesson that the teacher did join, and nobody confirmed the outcome.
 * Ended lessons without join evidence (for example before the school started
 * using Tutlio attendance) are not counted.
 */
export function isUnconfirmedDetectedStudentAbsence(
  session: {
    status?: string | null;
    no_show_reason?: string | null;
    status_confirmed_at?: string | null;
    meeting_link?: string | null;
    start_time?: string;
    end_time?: string | null;
    student_joined_at?: string | null;
    tutor_joined_at?: string | null;
  },
  now: Date = new Date(),
): boolean {
  if (session.status_confirmed_at || session.status === 'cancelled') return false;
  if (session.no_show_reason === NO_SHOW_REASON_MISSED_JOIN || isUnconfirmedAutomaticNoShow(session)) return true;
  if (!session.start_time) return false;
  return shouldReviewStudentAttendanceFromMissingJoin({
    id: 'review',
    start_time: session.start_time,
    end_time: session.end_time,
    meeting_link: session.meeting_link,
    status: 'active',
    student_joined_at: session.student_joined_at,
    tutor_joined_at: session.tutor_joined_at,
  }, now);
}

export function orgHasJoinNoShow(features: Record<string, unknown> | null | undefined): boolean {
  return features?.school_join_no_show === true;
}
