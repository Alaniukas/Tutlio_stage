/**
 * Lesson attendance derived from "join lesson" click timestamps
 * (sessions.tutor_joined_at / sessions.student_joined_at).
 *
 * Shared by the frontend and the serverless API (same pattern as
 * api/feature-render.ts importing from src/lib). Keep this file pure —
 * no React / Supabase / DOM imports.
 */

/** Clicks are recorded only from 30 min before the lesson start... */
export const JOIN_CLICK_WINDOW_BEFORE_MS = 30 * 60 * 1000;
/** ...until lesson end, and a side counts as attended when it joined within 10 min after start. */
export const ATTENDANCE_GRACE_MS = 10 * 60 * 1000;

export type AttendanceSideStatus = 'joined' | 'late' | 'missing' | 'pending';

export interface AttendanceSessionLike {
  start_time: string;
  end_time?: string | null;
  status?: string | null;
  tutor_joined_at?: string | null;
  student_joined_at?: string | null;
}

export interface AttendanceInfo {
  /** False while the lesson is cancelled or the 10 min grace window has not passed yet. */
  applicable: boolean;
  tutor: AttendanceSideStatus;
  student: AttendanceSideStatus;
  /** True when grace passed and at least one side did not join within 10 min of start. */
  flagged: boolean;
}

/** Whether a join click at `now` should be recorded for this lesson. */
export function isWithinJoinClickWindow(
  now: Date,
  startTime: string,
  endTime?: string | null,
): boolean {
  const startMs = Date.parse(startTime);
  if (!Number.isFinite(startMs)) return false;
  const nowMs = now.getTime();
  if (nowMs < startMs - JOIN_CLICK_WINDOW_BEFORE_MS) return false;
  const endMs = endTime ? Date.parse(endTime) : NaN;
  const cutoff = Number.isFinite(endMs) ? endMs : startMs + 2 * 60 * 60 * 1000;
  return nowMs <= cutoff;
}

function sideStatus(
  joinedAt: string | null | undefined,
  startMs: number,
  nowMs: number,
): AttendanceSideStatus {
  if (joinedAt) {
    const joinedMs = Date.parse(joinedAt);
    if (Number.isFinite(joinedMs)) {
      return joinedMs <= startMs + ATTENDANCE_GRACE_MS ? 'joined' : 'late';
    }
  }
  return nowMs > startMs + ATTENDANCE_GRACE_MS ? 'missing' : 'pending';
}

export type AttendanceReviewSession = AttendanceSessionLike & {
  meeting_link?: string | null;
  status?: string | null;
};

/** Online lesson with a meeting link where the grace window passed and someone did not join on time. */
export function isAttendanceFlagged(
  session: AttendanceReviewSession,
  now: Date = new Date(),
): boolean {
  if (!(session.meeting_link || '').trim()) return false;
  if (session.status === 'cancelled' || session.status === 'no_show') return false;
  return deriveAttendance(session, now).flagged;
}

export function deriveAttendance(
  session: AttendanceSessionLike,
  now: Date = new Date(),
): AttendanceInfo {
  const startMs = Date.parse(session.start_time);
  const nowMs = now.getTime();
  if (session.status === 'cancelled' || !Number.isFinite(startMs)) {
    return { applicable: false, tutor: 'pending', student: 'pending', flagged: false };
  }

  const tutor = sideStatus(session.tutor_joined_at, startMs, nowMs);
  const student = sideStatus(session.student_joined_at, startMs, nowMs);
  const applicable = nowMs > startMs + ATTENDANCE_GRACE_MS;
  const flagged = applicable && (tutor !== 'joined' || student !== 'joined');

  return { applicable, tutor, student, flagged };
}
