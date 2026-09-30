import { isUnconfirmedAutomaticNoShow } from './schoolJoinNoShow.js';
import { effectiveSessionOutcome } from './sessionStatusConfirmation.js';

export type SchoolOutcomeOptions = {
  requireConfirmation?: boolean;
};

type Row = {
  id?: string;
  class_group_id?: string | null;
  tutor_id?: string;
  start_time?: string;
  end_time?: string | null;
  status?: string | null;
  student_id?: string;
  student_name?: string;
  student_joined_at?: string | null;
  status_confirmed_at?: string | null;
  cancellation_reason?: string | null;
  no_show_reason?: string | null;
};

export type SchoolMeetingRow = Row & {
  subject_id?: string | null;
  subject_is_group?: boolean | null;
  subjects?: { is_group?: boolean | null } | null;
  cancelled_by?: string | null;
};

export type SchoolMeetingOccurrence<T extends SchoolMeetingRow = SchoolMeetingRow> = {
  key: string;
  row: T;
  rows: T[];
  studentCount: number;
};

export type SchoolStudentAttendanceRow = {
  id: string;
  name: string;
  joined: number;
  noShow: number;
  cancelled: number;
  unconfirmed: number;
};

export type SchoolActivitySummary = {
  /** Non-cancelled meeting occurrences in the selected period. */
  scheduled: number;
  completed: number;
  upcoming: number;
  noShowMeetings: number;
  cancelled: number;
  awaitingOutcome: number;
  attendedStudents: number;
  absentStudents: number;
  unconfirmedStudents: number;
  confirmedAttendance: number;
  attendanceRate: number | null;
};

function meetingKey(row: SchoolMeetingRow, index: number): string {
  const groupId = row.class_group_id
    || ((row.subject_is_group || row.subjects?.is_group) ? row.subject_id : null);
  const instant = Date.parse(row.start_time || '');
  return groupId && Number.isFinite(instant)
    ? `${row.class_group_id ? 'class' : 'subject'}|${groupId}|${row.tutor_id}|${instant}`
    : `individual|${row.id || index}`;
}

/** Canonical outcome for sibling attendance rows from one school meeting. */
export function pickSchoolMeetingOutcome<T extends Pick<SchoolMeetingRow,
  'status' | 'status_confirmed_at' | 'no_show_reason' | 'cancelled_by'
>>(
  rows: T[],
  options: SchoolOutcomeOptions = {},
): T | undefined {
  if (!rows.length) return undefined;
  const effectiveRows = rows.map((item) => {
    const status = isUnconfirmedAutomaticNoShow(item)
      ? 'active'
      : options.requireConfirmation
        ? effectiveSessionOutcome(item, true)
        : item.status;
    return status === item.status ? item : ({ ...item, status } as T);
  });
  const representative = ['completed', 'active', 'no_show', 'cancelled']
    .map(status => effectiveRows.find(item => item.status === status)).find(Boolean) || effectiveRows[0];
  if (representative.status !== 'cancelled') return representative;
  const roles = new Set(rows.map(item => item.cancelled_by || null));
  return roles.size === 1 ? representative : { ...representative, cancelled_by: null };
}

/**
 * Materialized class-group lessons have one session row per child. This is the
 * canonical occurrence grouping used by school dashboard, lists and stats.
 */
export function schoolMeetingOccurrences<T extends SchoolMeetingRow>(
  rows: T[],
  options: SchoolOutcomeOptions = {},
): SchoolMeetingOccurrence<T>[] {
  const groups = new Map<string, T[]>();
  rows.forEach((row, index) => {
    const key = meetingKey(row, index);
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  });

  return [...groups].map(([key, group]) => {
    const row = pickSchoolMeetingOutcome(group, options)!;
    return {
      key,
      row,
      rows: group,
      studentCount: new Set(group.map(item => item.student_id).filter(Boolean)).size,
    };
  });
}

/** Group before filtering outcomes: an absent child does not create a second paid lesson. */
export function schoolMeetings<T extends SchoolMeetingRow>(rows: T[], options: SchoolOutcomeOptions = {}): T[] {
  return schoolMeetingOccurrences(rows, options).map(occurrence => occurrence.row);
}
export function schoolMeetingCounts(rows: SchoolMeetingRow[], options: SchoolOutcomeOptions = {}) {
  const result = { completed: 0, no_show: 0, cancelled: 0, active: 0 };
  for (const row of schoolMeetings(rows, options)) {
    if (row.status && row.status in result) result[row.status as keyof typeof result]++;
  }
  return result;
}

export function schoolStudentAttendance(
  rows: Row[],
  now: Date = new Date(),
  options: SchoolOutcomeOptions = {},
): SchoolStudentAttendanceRow[] {
  const students = new Map<string, SchoolStudentAttendanceRow>();
  for (const row of rows) {
    if (!row.student_id) continue;
    const student = students.get(row.student_id) || { id: row.student_id, name: row.student_name || '–', joined: 0, noShow: 0, cancelled: 0, unconfirmed: 0 };
    const status = options.requireConfirmation ? effectiveSessionOutcome(row, true) : row.status;
    if (status === 'cancelled') student.cancelled++;
    else if (status === 'no_show' && !isUnconfirmedAutomaticNoShow(row)) student.noShow++;
    else if (options.requireConfirmation
      ? status === 'completed' && Boolean(row.status_confirmed_at)
      : row.student_joined_at || (status === 'completed' && row.status_confirmed_at)) student.joined++;
    else {
      const attendanceCutoff = Date.parse(row.end_time || row.start_time || '');
      if (Number.isFinite(attendanceCutoff) && attendanceCutoff < now.getTime()) student.unconfirmed++;
    }
    students.set(student.id, student);
  }
  return [...students.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** School activity KPIs: meetings once per occurrence, attendance once per child. */
export function schoolActivitySummary(
  rows: SchoolMeetingRow[],
  now: Date = new Date(),
  options: SchoolOutcomeOptions = {},
): SchoolActivitySummary {
  const occurrences = schoolMeetingOccurrences(rows, options);
  const attendance = schoolStudentAttendance(rows, now, options);
  const summary: SchoolActivitySummary = {
    scheduled: 0,
    completed: 0,
    upcoming: 0,
    noShowMeetings: 0,
    cancelled: 0,
    awaitingOutcome: 0,
    attendedStudents: 0,
    absentStudents: 0,
    unconfirmedStudents: 0,
    confirmedAttendance: 0,
    attendanceRate: null,
  };

  for (const { row } of occurrences) {
    if (row.status === 'cancelled') {
      summary.cancelled += 1;
      continue;
    }
    summary.scheduled += 1;
    if (row.status === 'completed') summary.completed += 1;
    else if (row.status === 'no_show') summary.noShowMeetings += 1;
    else if (row.status === 'active') {
      const end = Date.parse(row.end_time || row.start_time || '');
      if (Number.isFinite(end) && end < now.getTime()) summary.awaitingOutcome += 1;
      else summary.upcoming += 1;
    }
  }

  for (const student of attendance) {
    summary.attendedStudents += student.joined;
    summary.absentStudents += student.noShow;
    summary.unconfirmedStudents += student.unconfirmed;
  }
  summary.confirmedAttendance = summary.attendedStudents + summary.absentStudents;
  if (summary.confirmedAttendance > 0) {
    summary.attendanceRate = Math.round((summary.attendedStudents / summary.confirmedAttendance) * 100);
  }
  return summary;
}
