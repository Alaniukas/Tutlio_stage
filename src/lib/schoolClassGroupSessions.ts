import type { SchoolClassGroupRecord } from './schoolClassGroups';
import { classGroupCalendarLabel } from './schoolClassGroups.js';

export type ClassGroupMemberDisplay = {
  student_id: string;
  full_name: string;
  grade?: string | null;
  email?: string | null;
};

export type ClassGroupMeta = {
  id: string;
  name: string;
  calendarName: string;
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
      calendarName: classGroupCalendarLabel(group),
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
      topic: first.topic && first.topic !== meta.calendarName && first.topic !== meta.name
        ? first.topic
        : null,
      student: { full_name: meta.calendarName },
      _isClassGroup: true,
      _classGroupId: meta.id,
      _classGroupName: meta.calendarName,
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
  const name = session.student?.full_name?.trim();
  const grade = session.student?.grade?.trim();
  if (name && grade) return `${name} · ${grade}`;
  return name || fallbackUnknown;
}

export function classGroupDisplayName(
  classGroupId: string | null | undefined,
  groupMeta: Map<string, ClassGroupMeta>,
): string | null {
  if (!classGroupId) return null;
  return groupMeta.get(classGroupId)?.calendarName ?? null;
}

/** Append topic to calendar title only when it adds information. */
export function calendarSessionTopicSuffix(
  displayName: string,
  topic?: string | null,
): string {
  const t = String(topic || '').trim();
  if (!t) return '';
  const base = String(displayName || '').trim();
  if (!base || t === base) return '';
  return ` · ${t}`;
}

export function orgScheduleSessionTitle(
  session: ClassGroupSessionRow & {
    _classGroupName?: string;
    tutor?: { full_name?: string | null } | null;
  },
  fallbackUnknown: string,
  opts: { isSchoolOrg?: boolean; tutorFallback?: string } = {},
): string {
  const name = calendarTitleForSession(session, fallbackUnknown);
  if (opts.isSchoolOrg && session._classGroupName) return name;
  const tutor = String(session.tutor?.full_name || opts.tutorFallback || 'Tutorius').trim();
  if (!tutor || name.toLowerCase().includes(tutor.toLowerCase())) return name;
  return `${name} - ${tutor}`;
}

export type ClassGroupCancelScope = 'one_student' | 'whole_occurrence';

/** Merged class-group events must not use the recurring "this vs all future" dialog. */
export function usesClassGroupCancelFlow(opts: {
  isClassGroupSession?: boolean;
  classGroupId?: string | null;
}): boolean {
  return Boolean(opts.isClassGroupSession || String(opts.classGroupId || '').trim());
}

/** Active sibling rows for a class-group slot: one child vs every member at this time. */
export function classGroupCancelTargets<T extends { student_id: string; status: string }>(
  sessions: T[],
  scope: ClassGroupCancelScope,
  studentId?: string | null,
): T[] {
  const active = sessions.filter((row) => row.status === 'active');
  if (scope === 'whole_occurrence') return active;
  const sid = String(studentId || '').trim();
  if (!sid) return [];
  return active.filter((row) => row.student_id === sid);
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
