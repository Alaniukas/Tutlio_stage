import { deriveAttendance, type AttendanceSessionLike } from './attendance.js';
import { schoolAttendanceLabel } from './i18n/schoolAttendanceCopy.js';
import { effectiveSessionOutcome } from './sessionStatusConfirmation.js';

export type SchoolAttendanceSelection = 'completed' | 'late' | 'no_show';

export function schoolLessonHasEnded(endTime: Date | string, now = new Date()): boolean {
  const end = endTime instanceof Date ? endTime : new Date(endTime);
  return Number.isFinite(end.getTime()) && end.getTime() <= now.getTime();
}

export function schoolSessionNeedsTeacherAttendance(
  session: AttendanceSessionLike & { status?: string | null; end_time: Date | string },
  requireConfirmation: boolean,
  now = new Date(),
): boolean {
  if (!schoolLessonHasEnded(session.end_time, now)) return false;
  const outcome = effectiveSessionOutcome(session, requireConfirmation);
  if (outcome === 'active') return true;
  return requireConfirmation
    && ['completed', 'no_show'].includes(session.status || '')
    && !session.status_confirmed_at;
}

export function schoolSessionAttendanceSelection(
  session: AttendanceSessionLike & { status?: string | null; completed_late?: boolean | null },
  requireConfirmation: boolean,
): SchoolAttendanceSelection | null {
  const outcome = effectiveSessionOutcome(session, requireConfirmation);
  if (outcome === 'completed') return session.completed_late ? 'late' : 'completed';
  if (outcome === 'no_show') return 'no_show';
  return null;
}

export function schoolAttendanceAutoHint(
  session: AttendanceSessionLike & { meeting_link?: string | null },
  locale: string,
): string | null {
  if (!(session.meeting_link || '').trim()) return null;
  const info = deriveAttendance(session);
  if (!info.applicable) return null;
  const time = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleTimeString(locale === 'lt' ? 'lt-LT' : locale, { hour: '2-digit', minute: '2-digit' }) : '';
  if (info.student === 'joined') return schoolAttendanceLabel(locale, 'autoJoined');
  if (info.student === 'late') return schoolAttendanceLabel(locale, 'autoLate').replace('{time}', time((session as any).student_joined_at));
  if (info.student === 'missing') return schoolAttendanceLabel(locale, 'autoMissing');
  return null;
}

export function schoolClassGroupOccurrenceKey(groupId: string, startTime: Date | string): string {
  const startMs = startTime instanceof Date ? startTime.getTime() : Date.parse(String(startTime));
  return `group:${groupId}:${startMs}`;
}
