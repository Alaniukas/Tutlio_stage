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

export function toValidDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** react-big-calendar whitescreens / hangs on Invalid Date or end <= start. */
export function isUsableCalendarDateRange(start: unknown, end: unknown): boolean {
  const s = toValidDate(start);
  const e = toValidDate(end);
  return Boolean(s && e && e.getTime() > s.getTime());
}

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
  opts?: { preferCancelledOccurrence?: boolean },
): Array<T | MergedClassGroupSession<T>> {
  const grouped = new Map<string, T[]>();
  const individual: T[] = [];

  for (const session of sessions) {
    const start = toValidDate(session.start_time);
    const end = toValidDate(session.end_time);
    const groupId = session.class_group_id;
    if (start && end && groupId && groupMeta.has(groupId)) {
      const key = `${groupId}_${sessionTimeKey(start, end)}`;
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
    const display = opts?.preferCancelledOccurrence
      ? (pickClassGroupOccurrenceSession(enrichedRows) ?? first)
      : first;

    merged.push({
      ...display,
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

export function isSyntheticClassGroupCalendarId(id: string | null | undefined): boolean {
  return String(id || '').startsWith('classgroup_');
}

/** Real `sessions.id` values for one class-group slot (never the merged calendar id). */
export function classGroupOccurrenceSessionIds<T extends { id: string }>(sessions: T[]): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const row of sessions) {
    const id = String(row.id || '').trim();
    if (!id || isSyntheticClassGroupCalendarId(id) || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

/** Active or leftover completed rows that a whole-slot cancel should still mark cancelled. */
export function sessionStatusCanCancel(status: string): boolean {
  const s = normalizeSessionStatus(status);
  return s === 'active' || s === 'completed';
}

/** Active sibling rows for a class-group slot: one child vs every member at this time. */
export function classGroupCancelTargets<T extends { student_id: string; status: string }>(
  sessions: T[],
  scope: ClassGroupCancelScope,
  studentId?: string | null,
  opts?: { includeCompleted?: boolean },
): T[] {
  const cancellable = sessions.filter((row) =>
    opts?.includeCompleted ? sessionStatusCanCancel(row.status) : row.status === 'active',
  );
  if (scope === 'whole_occurrence') return cancellable;
  const sid = String(studentId || '').trim();
  if (!sid) return [];
  return cancellable.filter((row) => row.student_id === sid);
}

export function normalizeSessionStatus(status: string): string {
  return status === 'canceled' ? 'cancelled' : status;
}

function isCancelledStatus(status: string): boolean {
  return normalizeSessionStatus(status) === 'cancelled';
}

function isOccurredStatus(status: string): boolean {
  const s = normalizeSessionStatus(status);
  return s === 'completed' || s === 'no_show';
}

/**
 * Calendar / modal header for a merged slot must not follow array order.
 * After a whole-group cancel, leftover auto-completed rows should not win
 * over cancelled siblings when cancel is a substantial share of the slot
 * (not a single student among a completed class).
 */
export function pickClassGroupOccurrenceSession<T extends { status: string }>(
  rows: T[],
): T | undefined {
  if (!rows.length) return undefined;
  const active = rows.find((row) => normalizeSessionStatus(row.status) === 'active');
  if (active) return active;
  const cancelled = rows.filter((row) => isCancelledStatus(row.status));
  const occurred = rows.filter((row) => isOccurredStatus(row.status));
  if (cancelled.length > 0 && cancelled.length * 2 >= occurred.length) return cancelled[0];
  if (occurred.length) return occurred[0];
  return cancelled[0] ?? rows[0];
}

export function isClassGroupOccurrenceCancelled(statuses: readonly string[]): boolean {
  const normalized = statuses.map(normalizeSessionStatus);
  if (normalized.some((status) => status === 'active')) return false;
  const cancelledCount = normalized.filter((status) => status === 'cancelled').length;
  if (cancelledCount === 0) return false;
  const occurredCount = normalized.filter((status) => status === 'completed' || status === 'no_show').length;
  return cancelledCount * 2 >= occurredCount;
}

/** Per-member label: leftover `completed` after a group cancel reads as cancelled. */
export function classGroupParticipantStatusForDisplay(
  status: string | null | undefined,
  siblingStatuses: readonly string[],
  opts?: { coerceCompletedAfterGroupCancel?: boolean },
): string | null {
  if (!status) return null;
  const normalized = normalizeSessionStatus(status);
  if (
    opts?.coerceCompletedAfterGroupCancel &&
    normalized === 'completed' &&
    isClassGroupOccurrenceCancelled(siblingStatuses)
  ) {
    return 'cancelled';
  }
  return normalized;
}

export function sessionStatusI18nKey(status: string): string {
  switch (normalizeSessionStatus(status)) {
    case 'completed':
      return 'status.completed';
    case 'cancelled':
      return 'status.cancelled';
    case 'no_show':
      return 'status.noShow';
    default:
      return 'compSch.statusActive';
  }
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
