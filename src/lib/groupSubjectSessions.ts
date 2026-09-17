import { pickClassGroupOccurrenceSession, toValidDate } from './schoolClassGroupSessions.js';

export type GroupSubjectMeta = {
  id: string;
  is_group?: boolean | null;
  max_students?: number | null;
};

export type GroupSubjectSessionRow = {
  id: string;
  tutor_id: string;
  subject_id?: string | null;
  class_group_id?: string | null;
  start_time: Date | string;
  end_time: Date | string;
  status: string;
  topic?: string | null;
  student?: { full_name?: string | null } | null;
  _isClassGroup?: boolean;
};

export type MergedGroupSubjectSession<T extends GroupSubjectSessionRow> = T & {
  _isGroup: true;
  _groupSessions: T[];
};

/**
 * A legacy group subject stores one session row per student. Collapse those
 * parallel rows into one calendar occurrence while retaining every row for
 * per-student attendance and file access.
 */
export function mergeGroupSubjectSessions<T extends GroupSubjectSessionRow>(
  sessions: T[],
  subjects: GroupSubjectMeta[],
  labels: { groupLesson: string; seats: string },
): Array<T | MergedGroupSubjectSession<T>> {
  const subjectById = new Map(subjects.map((subject) => [subject.id, subject]));
  const grouped = new Map<string, T[]>();
  const ungrouped: T[] = [];

  for (const session of sessions) {
    const subject = session.subject_id ? subjectById.get(session.subject_id) : undefined;
    const start = toValidDate(session.start_time);
    const end = toValidDate(session.end_time);
    if (
      session._isClassGroup
      || session.class_group_id
      || subject?.is_group !== true
      || !start
      || !end
    ) {
      ungrouped.push(session);
      continue;
    }

    const key = `${session.tutor_id}_${session.subject_id}_${start.getTime()}_${end.getTime()}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(session);
  }

  const merged: Array<T | MergedGroupSubjectSession<T>> = [...ungrouped];
  grouped.forEach((rows, key) => {
    if (!rows.length) return;
    const first = rows[0];
    const display = pickClassGroupOccurrenceSession(rows) ?? first;
    const subject = first.subject_id ? subjectById.get(first.subject_id) : undefined;
    const names = rows.map((row) => String(row.student?.full_name || '').trim()).filter(Boolean);
    const lessonName = String(first.topic || labels.groupLesson).trim() || labels.groupLesson;
    const displayName = rows.length === 1
      ? `${lessonName} (1/${subject?.max_students || 1} ${labels.seats})`
      : `${lessonName}: ${names.join(', ') || `${rows.length} ${labels.seats}`}`;

    merged.push({
      ...display,
      id: `groupsubject_${key}`,
      topic: first.topic,
      student: {
        ...(display.student || {}),
        full_name: displayName,
      },
      _isGroup: true,
      _groupSessions: rows,
    } as MergedGroupSubjectSession<T>);
  });

  return merged;
}

export function isMergedGroupSubjectSession<T extends GroupSubjectSessionRow>(
  session: T | MergedGroupSubjectSession<T>,
): session is MergedGroupSubjectSession<T> {
  return Boolean(
    (session as MergedGroupSubjectSession<T>)._isGroup
    && (session as MergedGroupSubjectSession<T>)._groupSessions?.length,
  );
}
