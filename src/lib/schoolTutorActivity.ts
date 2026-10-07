import { schoolActivitySummary, type SchoolMeetingRow, type SchoolOutcomeOptions } from './schoolSessionMonitoring.js';

export type SchoolTutorActivityRow = SchoolMeetingRow & {
  tutor_id?: string;
  status_confirmed_at?: string | null;
  tutor_joined_at?: string | null;
  student_joined_at?: string | null;
};

export type SchoolTutorActivityIndicators = {
  lastActivityAt: string | null;
  unconfirmedAttendance: number;
};

function parseTimestamp(value: string | null | undefined): number | null {
  const ms = Date.parse(value || '');
  return Number.isFinite(ms) ? ms : null;
}

/** Latest teacher-visible action on a session row: confirmation, join, or conducted meeting end. */
export function schoolTutorLastActivityAt(rows: SchoolTutorActivityRow[]): string | null {
  let best = 0;
  for (const row of rows) {
    const candidates = [
      row.status_confirmed_at,
      row.tutor_joined_at,
      ['completed', 'no_show'].includes(row.status || '') ? row.end_time : null,
    ];
    for (const value of candidates) {
      const ms = parseTimestamp(value);
      if (ms != null && ms > best) best = ms;
    }
  }
  return best > 0 ? new Date(best).toISOString() : null;
}

export function schoolTutorActivityIndicators(
  rows: SchoolTutorActivityRow[],
  now: Date = new Date(),
  options: SchoolOutcomeOptions = {},
): SchoolTutorActivityIndicators {
  return {
    lastActivityAt: schoolTutorLastActivityAt(rows),
    unconfirmedAttendance: schoolActivitySummary(rows, now, options).unconfirmedStudents,
  };
}

export function schoolTutorActivityByTutorId(
  rows: SchoolTutorActivityRow[],
  now: Date = new Date(),
  options: SchoolOutcomeOptions = {},
): Map<string, SchoolTutorActivityIndicators> {
  const grouped = new Map<string, SchoolTutorActivityRow[]>();
  for (const row of rows) {
    const tutorId = row.tutor_id;
    if (!tutorId) continue;
    const bucket = grouped.get(tutorId) || [];
    bucket.push(row);
    grouped.set(tutorId, bucket);
  }
  return new Map([...grouped].map(([tutorId, tutorRows]) => [
    tutorId,
    schoolTutorActivityIndicators(tutorRows, now, options),
  ]));
}
