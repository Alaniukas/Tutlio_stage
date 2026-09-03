import type { SchoolClassGroupRecord } from './schoolClassGroups';

export type ClassGroupMemberDisplay = {
  student_id: string;
  full_name: string;
  grade?: string | null;
  email?: string | null;
};

export type ClassGroupMeta = {
  id: string;
  name: string;
  members: ClassGroupMemberDisplay[];
};

export type ClassGroupSessionRow = {
  id: string;
  student_id: string;
  class_group_id?: string | null;
  start_time: Date;
  end_time: Date;
  status: string;
  paid?: boolean;
  topic?: string | null;
  student?: { full_name?: string; grade?: string | null; email?: string | null } | null;
};

export type MergedClassGroupSession<T extends ClassGroupSessionRow> = T & {
  _isClassGroup: true;
  _classGroupId: string;
  _classGroupName: string;
  _classGroupSessions: T[];
  _classGroupMembers: ClassGroupMemberDisplay[];
};

function sessionTimeKey(start: Date, end: Date): string {
  return `${start.getTime()}_${end.getTime()}`;
}

export function buildClassGroupMetaMap(groups: SchoolClassGroupRecord[]): Map<string, ClassGroupMeta> {
  const map = new Map<string, ClassGroupMeta>();
  for (const group of groups) {
    map.set(group.id, {
      id: group.id,
      name: group.name,
      members: (group.members || []).map((member) => ({
        student_id: member.student_id,
        full_name: member.student?.full_name || '—',
        grade: (member.student as { grade?: string | null } | undefined)?.grade ?? null,
        email: (member.student as { email?: string | null } | undefined)?.email ?? null,
      })),
    });
  }
  return map;
}

function enrichSessionStudent<T extends ClassGroupSessionRow>(
  row: T,
  members: ClassGroupMemberDisplay[],
): T {
  if (row.student?.full_name) return row;
  const member = members.find((m) => m.student_id === row.student_id);
  if (!member) return row;
  return {
    ...row,
    student: {
      ...(row.student || {}),
      full_name: member.full_name,
      grade: member.grade ?? row.student?.grade,
      email: member.email ?? row.student?.email,
    },
  };
}

export function mergeSchoolClassGroupSessions<T extends ClassGroupSessionRow>(
  sessions: T[],
  groupMeta: Map<string, ClassGroupMeta>,
): Array<T | MergedClassGroupSession<T>> {
  const grouped = new Map<string, T[]>();
  const individual: T[] = [];

  for (const session of sessions) {
    const groupId = session.class_group_id;
    if (groupId && groupMeta.has(groupId)) {
      const key = `${groupId}_${sessionTimeKey(session.start_time, session.end_time)}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(session);
    } else {
      individual.push(session);
    }
  }

  const merged: Array<T | MergedClassGroupSession<T>> = [...individual];

  grouped.forEach((rows, key) => {
    if (!rows.length) return;
    const first = rows[0];
    const meta = groupMeta.get(first.class_group_id!)!;
    const enrichedRows = rows.map((row) => enrichSessionStudent(row, meta.members));

    merged.push({
      ...first,
      id: `classgroup_${key}`,
      topic: first.topic || meta.name,
      student: { full_name: meta.name },
      _isClassGroup: true,
      _classGroupId: meta.id,
      _classGroupName: meta.name,
      _classGroupSessions: enrichedRows,
      _classGroupMembers: meta.members,
    } as MergedClassGroupSession<T>);
  });

  return merged;
}

export function isMergedClassGroupSession<T extends ClassGroupSessionRow>(
  session: T | MergedClassGroupSession<T>,
): session is MergedClassGroupSession<T> {
  return Boolean((session as MergedClassGroupSession<T>)._isClassGroup);
}

export function calendarTitleForSession(
  session: ClassGroupSessionRow & { _classGroupName?: string },
  fallbackUnknown: string,
): string {
  if (session._classGroupName) return session._classGroupName;
  return session.student?.full_name || fallbackUnknown;
}

export function classGroupParticipantsForModal<T extends ClassGroupSessionRow>(
  merged: MergedClassGroupSession<T>,
): Array<ClassGroupMemberDisplay & { session: T | null }> {
  const sessionByStudent = new Map(merged._classGroupSessions.map((row) => [row.student_id, row]));
  return merged._classGroupMembers.map((member) => ({
    ...member,
    session: sessionByStudent.get(member.student_id) ?? null,
  }));
}
