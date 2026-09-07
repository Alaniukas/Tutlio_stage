import { isAfter, isBefore, startOfDay, endOfDay } from 'date-fns';
import { deriveAttendance, type AttendanceSessionLike } from './attendance';

export interface Session {
  id: string;
  tutor_id: string;
  student_id: string;
  start_time: string; // ISO timestamp
  end_time: string;
  status: 'active' | 'cancelled' | 'completed' | 'no_show';
  price: number | null;
  topic?: string | null;
  cancelled_by?: 'tutor' | 'student' | null;
  cancellation_reason?: string | null;
  meeting_link?: string | null;
  student_joined_at?: string | null;
  tutor_joined_at?: string | null;
  student?: {
    full_name: string;
    email?: string;
  };
  tutor?: {
    full_name: string;
  };
}

export interface SessionStats {
  totalSuccessful: number;
  totalStudentNoShow: number;
  totalCancelled: number;
  cancelledByTutor: number;
  cancelledByStudent: number;
}

export interface StudentSessionStats extends SessionStats {
  studentId: string;
  studentName: string;
}

/**
 * Filters sessions by date range
 * Shows only occurred sessions (completed or past cancelled)
 */
export function filterSessionsByDateRange(
  sessions: Session[],
  startDate: Date | null,
  endDate: Date | null
): Session[] {
  const now = new Date();

  return sessions.filter((session) => {
    const sessionDate = new Date(session.start_time);

    // Cannot select future sessions
    if (isAfter(sessionDate, now)) {
      return false;
    }

    // Filter by start date
    if (startDate && isBefore(sessionDate, startOfDay(startDate))) {
      return false;
    }

    // Filter by end date
    if (endDate && isAfter(sessionDate, endOfDay(endDate))) {
      return false;
    }

    return true;
  });
}

/**
 * Student did not attend: explicit no_show status, or join-link attendance shows
 * student missing after the grace window (even if cron has not flipped status yet).
 */
export function isStudentNoShowSession(session: Session, now: Date = new Date()): boolean {
  if (session.status === 'no_show') return true;
  if (session.status === 'cancelled') return false;
  if (!(session.meeting_link || '').trim()) return false;
  const info = deriveAttendance(session as AttendanceSessionLike, now);
  return info.applicable && info.student === 'missing';
}

/**
 * Calculates overall session statistics
 *
 * Note: A session is considered occurred if:
 * - status === 'completed' ARBA
 * - status === 'active' BUT end_time has already passed (awaiting cron auto-complete)
 *
 * This ensures correct counts even if the cron has not finished yet.
 */
export function calculateSessionStats(
  sessions: Session[],
  startDate: Date | null = null,
  endDate: Date | null = null
): SessionStats {
  const filteredSessions = filterSessionsByDateRange(sessions, startDate, endDate);
  const now = new Date();

  const stats: SessionStats = {
    totalSuccessful: 0,
    totalStudentNoShow: 0,
    totalCancelled: 0,
    cancelledByTutor: 0,
    cancelledByStudent: 0,
  };

  filteredSessions.forEach((session) => {
    const sessionEndTime = new Date(session.end_time);
    const hasEnded = sessionEndTime < now;

    if (isStudentNoShowSession(session, now)) {
      stats.totalStudentNoShow++;
      return;
    }

    if (session.status === 'completed' || (session.status === 'active' && hasEnded)) {
      stats.totalSuccessful++;
    } else if (session.status === 'cancelled') {
      stats.totalCancelled++;

      if (session.cancelled_by === 'tutor') {
        stats.cancelledByTutor++;
      } else if (session.cancelled_by === 'student') {
        stats.cancelledByStudent++;
      }
    }
  });

  return stats;
}

/**
 * Calculates session statistics for a single student
 */
export function getStudentSessionStats(
  sessions: Session[],
  studentId: string,
  startDate: Date | null = null,
  endDate: Date | null = null
): SessionStats {
  const studentSessions = sessions.filter(
    (session) => session.student_id === studentId
  );

  return calculateSessionStats(studentSessions, startDate, endDate);
}

/**
 * Returns statistics for all students, sorted alphabetically
 */
export function getAllStudentsStats(
  sessions: Session[],
  startDate: Date | null = null,
  endDate: Date | null = null
): StudentSessionStats[] {
  // Surinkti unikalius mokinius
  const studentsMap = new Map<string, string>();
  sessions.forEach((session) => {
    if (session.student?.full_name && !studentsMap.has(session.student_id)) {
      studentsMap.set(session.student_id, session.student.full_name);
    }
  });

  // Calculate each student's statistics
  const studentsStats: StudentSessionStats[] = [];
  studentsMap.forEach((studentName, studentId) => {
    const stats = getStudentSessionStats(sessions, studentId, startDate, endDate);
    studentsStats.push({
      ...stats,
      studentId,
      studentName,
    });
  });

  // Sort alphabetically (with Lithuanian character support)
  studentsStats.sort((a, b) =>
    a.studentName.localeCompare(b.studentName, 'lt')
  );

  return studentsStats;
}

/**
 * Returns filtered sessions for a specific student
 */
export function getStudentSessions(
  sessions: Session[],
  studentId: string,
  startDate: Date | null = null,
  endDate: Date | null = null
): Session[] {
  const studentSessions = sessions.filter(
    (session) => session.student_id === studentId
  );

  // Sort from earliest to latest session (ascending by start_time)
  return filterSessionsByDateRange(studentSessions, startDate, endDate).sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );
}

export interface SessionAttributionRow {
  status?: string | null;
  cancelled_by?: string | null;
  rescheduled_at?: string | null;
  reschedule_reason?: string | null;
  reschedule_requested_by?: string | null;
}

/**
 * Who a reschedule is attributed to. Prefers the explicit
 * reschedule_requested_by column; legacy rows fall back on the fact that
 * reschedule_reason is written only by tutor/org-admin moves, while
 * student-initiated self-service moves never set it.
 */
export function rescheduleAttribution(row: SessionAttributionRow): 'student' | 'tutor' | null {
  if (!row.rescheduled_at) return null;
  if (row.reschedule_requested_by === 'student' || row.reschedule_requested_by === 'tutor') {
    return row.reschedule_requested_by;
  }
  return row.reschedule_reason && row.reschedule_reason.trim().length > 0 ? 'tutor' : 'student';
}

export interface CancellationCounters {
  totalCancelled: number;
  cancelledByTutor: number;
  cancelledByStudent: number;
  /** Admin / system / legacy rows without cancelled_by (e.g. recurring schedule removed). */
  cancelledByAdmin: number;
}

/** Split cancelled sessions by who initiated — breakdown sums to totalCancelled. */
export function countCancellationAttribution(
  rows: Array<{ status?: string | null; cancelled_by?: string | null }>,
): CancellationCounters {
  const counters: CancellationCounters = {
    totalCancelled: 0,
    cancelledByTutor: 0,
    cancelledByStudent: 0,
    cancelledByAdmin: 0,
  };
  for (const row of rows) {
    if (row.status !== 'cancelled') continue;
    counters.totalCancelled += 1;
    if (row.cancelled_by === 'student') counters.cancelledByStudent += 1;
    else if (row.cancelled_by === 'tutor') counters.cancelledByTutor += 1;
    else counters.cancelledByAdmin += 1;
  }
  return counters;
}

export type CancellationBreakdownLabelFn = (
  role: 'tutor' | 'student' | 'admin',
  count: number,
) => string;

/** Localized breakdown for org stats (was hardcoded K/M/A). */
export function formatCancellationBreakdown(
  counters: Pick<
    CancellationCounters,
    'totalCancelled' | 'cancelledByTutor' | 'cancelledByStudent' | 'cancelledByAdmin'
  >,
  label: CancellationBreakdownLabelFn,
): string {
  if (counters.totalCancelled <= 0) return '—';
  const parts: string[] = [];
  if (counters.cancelledByTutor > 0) parts.push(label('tutor', counters.cancelledByTutor));
  if (counters.cancelledByStudent > 0) parts.push(label('student', counters.cancelledByStudent));
  if (counters.cancelledByAdmin > 0) parts.push(label('admin', counters.cancelledByAdmin));
  return parts.length > 0
    ? `${counters.totalCancelled} (${parts.join(' ')})`
    : String(counters.totalCancelled);
}

/** Tutor/student-initiated cancellations only (excludes admin schedule cleanup). */
export function countUserInitiatedCancellations(counters: CancellationCounters): number {
  return counters.cancelledByTutor + counters.cancelledByStudent;
}

export interface StudentSessionCounters {
  cancelledByStudent: number;
  cancelledByTutor: number;
  movedByStudent: number;
  movedByTutor: number;
}

/** Move/cancel counters for the org student card, split by who initiated. */
export function countStudentSessionStats(rows: SessionAttributionRow[]): StudentSessionCounters {
  const counters: StudentSessionCounters = {
    cancelledByStudent: 0,
    cancelledByTutor: 0,
    movedByStudent: 0,
    movedByTutor: 0,
  };
  for (const row of rows) {
    if (row.status === 'cancelled') {
      if (row.cancelled_by === 'student') counters.cancelledByStudent += 1;
      else if (row.cancelled_by === 'tutor') counters.cancelledByTutor += 1;
    }
    const moved = rescheduleAttribution(row);
    if (moved === 'student') counters.movedByStudent += 1;
    else if (moved === 'tutor') counters.movedByTutor += 1;
  }
  return counters;
}

/**
 * Org admin student modal: past "occurred" (incl. no_show) + cancelled sessions,
 * newest by end_time first, capped for a short history list.
 */
export function getStudentRecentPastSessions(
  sessions: Session[],
  studentId: string,
  limit = 3
): Session[] {
  const base = filterSessionsByDateRange(
    sessions.filter((s) => s.student_id === studentId),
    null,
    null
  );
  const now = new Date();
  const occurredLike = base.filter(
    (s) => s.status !== 'cancelled' && new Date(s.end_time).getTime() < now.getTime()
  );
  const cancelled = base.filter((s) => s.status === 'cancelled');
  const byId = new Map<string, Session>();
  for (const s of [...occurredLike, ...cancelled]) byId.set(s.id, s);
  return Array.from(byId.values())
    .sort((a, b) => new Date(b.end_time).getTime() - new Date(a.end_time).getTime())
    .slice(0, limit);
}
