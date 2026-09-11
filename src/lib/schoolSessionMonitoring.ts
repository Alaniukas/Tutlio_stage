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

/**
 * Materialized class-group lessons have one session row per child. This is the
 * canonical occurrence grouping used by school dashboard, lists and stats.
 */
export function schoolMeetingOccurrences<T extends SchoolMeetingRow>(rows: T[]): SchoolMeetingOccurrence<T>[] {
  const groups = new Map<string, T[]>();
  rows.forEach((row, index) => {
    const key = meetingKey(row, index);
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  });

  return [...groups].map(([key, group]) => {
    const representative = ['completed', 'active', 'no_show', 'cancelled']
      .map(status => group.find(item => item.status === status)).find(Boolean) || group[0];
    const row = representative.status !== 'cancelled'
      ? representative
      : (() => {
          const roles = new Set(group.map(item => item.cancelled_by || null));
          return roles.size === 1 ? representative : { ...representative, cancelled_by: null };
        })();
    return {
      key,
      row,
      rows: group,
      studentCount: new Set(group.map(item => item.student_id).filter(Boolean)).size,
    };
  });
}

/** Group before filtering outcomes: an absent child does not create a second paid lesson. */
export function schoolMeetings<T extends SchoolMeetingRow>(rows: T[]): T[] {
  return schoolMeetingOccurrences(rows).map(occurrence => occurrence.row);
}
export function schoolMeetingCounts(rows: SchoolMeetingRow[]) {
  const result = { completed: 0, no_show: 0, cancelled: 0, active: 0 };
  for (const row of schoolMeetings(rows)) {
    if (row.status && row.status in result) result[row.status as keyof typeof result]++;
  }
  return result;
}

export function schoolStudentAttendance(rows: Row[], now: Date = new Date()): SchoolStudentAttendanceRow[] {
  const students = new Map<string, SchoolStudentAttendanceRow>();
  for (const row of rows) {
    if (!row.student_id) continue;
    const student = students.get(row.student_id) || { id: row.student_id, name: row.student_name || '–', joined: 0, noShow: 0, cancelled: 0, unconfirmed: 0 };
    if (row.status === 'cancelled') student.cancelled++;
    else if (row.status === 'no_show') student.noShow++;
    else if (row.student_joined_at || (row.status === 'completed' && row.status_confirmed_at)) student.joined++;
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
): SchoolActivitySummary {
  const occurrences = schoolMeetingOccurrences(rows);
  const attendance = schoolStudentAttendance(rows, now);
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
