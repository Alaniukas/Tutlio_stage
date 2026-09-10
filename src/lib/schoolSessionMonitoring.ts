type Row = { id?: string; class_group_id?: string | null; tutor_id?: string; start_time?: string; status?: string | null; student_id?: string; student_name?: string; student_joined_at?: string | null; status_confirmed_at?: string | null; cancellation_reason?: string | null; no_show_reason?: string | null };

export type SchoolMeetingRow = Row & {
  subject_id?: string | null;
  subject_is_group?: boolean | null;
  subjects?: { is_group?: boolean | null } | null;
  cancelled_by?: string | null;
};

/** Group before filtering outcomes: an absent child does not create a second paid lesson. */
export function schoolMeetings<T extends SchoolMeetingRow>(rows: T[]): T[] {
  const groups = new Map<string, T[]>();
  rows.forEach((row, index) => {
    const groupId = row.class_group_id || ((row.subject_is_group || row.subjects?.is_group) ? row.subject_id : null);
    const instant = Date.parse(row.start_time || '');
    const key = groupId && Number.isFinite(instant)
      ? `${row.class_group_id ? 'class' : 'subject'}|${groupId}|${row.tutor_id}|${instant}`
      : `individual|${row.id || index}`;
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  });
  return [...groups.values()].map(group => {
    const row = ['completed', 'active', 'no_show', 'cancelled']
      .map(status => group.find(item => item.status === status)).find(Boolean) || group[0];
    if (row.status !== 'cancelled') return row;
    const roles = new Set(group.map(item => item.cancelled_by || null));
    return { ...row, cancelled_by: roles.size === 1 ? row.cancelled_by : null };
  });
}
export function schoolMeetingCounts(rows: SchoolMeetingRow[]) {
  const result = { completed: 0, no_show: 0, cancelled: 0, active: 0 };
  for (const row of schoolMeetings(rows)) {
    if (row.status && row.status in result) result[row.status as keyof typeof result]++;
  }
  return result;
}

export function schoolStudentAttendance(rows: Row[]) {
  const students = new Map<string, { id: string; name: string; joined: number; noShow: number; cancelled: number; unconfirmed: number }>();
  for (const row of rows) {
    if (!row.student_id) continue;
    const student = students.get(row.student_id) || { id: row.student_id, name: row.student_name || '–', joined: 0, noShow: 0, cancelled: 0, unconfirmed: 0 };
    if (row.status === 'cancelled') student.cancelled++;
    else if (row.status === 'no_show') student.noShow++;
    else if (row.student_joined_at || (row.status === 'completed' && row.status_confirmed_at)) student.joined++;
    else if (row.start_time && Date.parse(row.start_time) < Date.now()) student.unconfirmed++;
    students.set(student.id, student);
  }
  return [...students.values()].sort((a, b) => a.name.localeCompare(b.name));
}
