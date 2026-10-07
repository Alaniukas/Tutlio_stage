import type { SchoolMemberSlot } from './schoolClassGroups.js';

const vilniusSlotFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Vilnius', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** A group happening does not reserve a place for a child on every group day. */
export function schoolGroupSessionFollowsSchedule(
  session: { start_time?: string; original_start_time?: string | null },
  slots: readonly SchoolMemberSlot[] | null | undefined,
): boolean {
  if (slots == null) return true;
  const date = new Date(session.original_start_time || session.start_time || '');
  if (!Number.isFinite(date.getTime())) return false;
  const parts = vilniusSlotFormatter.formatToParts(date);
  const weekday = weekdays[parts.find((part) => part.type === 'weekday')?.value || ''];
  const minutes = Number(parts.find((part) => part.type === 'hour')?.value) * 60
    + Number(parts.find((part) => part.type === 'minute')?.value);
  return slots.some((slot) => {
    const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(String(slot.start_time || ''));
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59 || Number(slot.weekday) !== weekday) return false;
    // Legacy rows can start a few minutes off the planned time. An explicit
    // reschedule follows its original slot, including a move to another day.
    return Math.abs(minutes - (Number(match[1]) * 60 + Number(match[2]))) <= 5;
  });
}
