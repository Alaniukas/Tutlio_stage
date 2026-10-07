import { NO_SHOW_REASON_MISSED_JOIN } from './schoolJoinNoShow.js';

export type SchoolAttendanceMarkingSource = 'system' | 'teacher' | 'admin';

export type SchoolAttendanceMarkingSession = {
  tutor_id?: string | null;
  status?: string | null;
  end_time?: string | Date | null;
  status_confirmed_at?: string | null;
  status_confirmed_by?: string | null;
  no_show_reason?: string | null;
};

export type SchoolAttendanceMarking = {
  source: SchoolAttendanceMarkingSource;
  markedAt: string;
};

/** Final attendance outcome with actor and timestamp, when the lesson has ended. */
export function resolveSchoolAttendanceMarking(
  session: SchoolAttendanceMarkingSession,
  now = new Date(),
): SchoolAttendanceMarking | null {
  const endMs = session.end_time instanceof Date
    ? session.end_time.getTime()
    : Date.parse(String(session.end_time || ''));
  if (!Number.isFinite(endMs) || endMs > now.getTime()) return null;
  if (!['completed', 'no_show'].includes(session.status || '')) return null;

  const markedAt = session.status_confirmed_at;
  if (!markedAt) return null;

  const actor = session.status_confirmed_by;
  if (actor) {
    return {
      source: actor === session.tutor_id ? 'teacher' : 'admin',
      markedAt,
    };
  }

  // Legacy group backfill and other automated stamps without an actor.
  if (session.no_show_reason === NO_SHOW_REASON_MISSED_JOIN) {
    return { source: 'system', markedAt };
  }
  return { source: 'system', markedAt };
}

export function formatSchoolAttendanceMarkingDate(
  markedAt: string,
  locale: string,
): string {
  const date = new Date(markedAt);
  if (!Number.isFinite(date.getTime())) return '';
  const tag = locale === 'lt' ? 'lt-LT' : locale === 'pl' ? 'pl-PL' : 'en-GB';
  return new Intl.DateTimeFormat(tag, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Vilnius',
  }).format(date);
}
