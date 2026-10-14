import type { SessionIntervalRow } from './calendarSessionOverlap';
import { resolveAccessToken } from './authSession';

/** The database validates and saves occurrences, templates and exclusions together. */
export async function editTutorCalendarSeries(
  params: {
    sessionId: string;
    recurringIds: string[];
    oldStart: Date;
    oldEnd: Date;
    start: Date;
    end: Date;
    fields: Record<string, unknown>;
    reason: string;
    requestedBy: 'tutor' | 'student';
  },
): Promise<SessionIntervalRow[]> {
  const token = await resolveAccessToken();
  if (!token) throw new Error('reschedule_error');
  const response = await fetch('/api/tutor-calendar-series-edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      sessionId: params.sessionId, recurringIds: params.recurringIds,
      oldStart: params.oldStart.toISOString(), oldEnd: params.oldEnd.toISOString(),
      newStart: params.start.toISOString(), newEnd: params.end.toISOString(),
      fields: params.fields, reason: params.reason, requestedBy: params.requestedBy,
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.code || 'reschedule_error');
  if (!Array.isArray(result.sessions) || !result.sessions.length) throw new Error('reschedule_changed');
  return result.sessions as SessionIntervalRow[];
}
