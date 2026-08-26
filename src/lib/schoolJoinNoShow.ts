/**
 * Auto-mark student no-show when they never clicked "Prisijungti".
 * Pure — used by cron and tests.
 */
import { ATTENDANCE_GRACE_MS, deriveAttendance, type AttendanceSessionLike } from './attendance';

export const NO_SHOW_REASON_MISSED_JOIN = 'missed_join';

export type JoinNoShowSession = AttendanceSessionLike & {
  id: string;
  meeting_link?: string | null;
  status?: string | null;
  student_joined_at?: string | null;
  tutor_joined_at?: string | null;
  end_time?: string | null;
};

/**
 * Student missed join → no_show only when:
 * - online lesson (meeting_link)
 * - still active
 * - grace window passed
 * - student never clicked join
 * - tutor DID join (otherwise the lesson likely did not happen — PDF 4.5)
 */
export function shouldMarkStudentNoShowFromMissedJoin(
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
