import { recurringAvailabilityAppliesOnDate } from './availabilityRecurring';

export type AvailabilityCalendarRow = {
  id: string;
  tutor_id: string;
  is_recurring: boolean | null;
  specific_date: string | null;
  day_of_week: number | null;
  start_time: string;
  end_time: string;
  start_date?: string | null;
  end_date?: string | null;
  subject_ids?: string[] | null;
  meeting_link?: string | null;
  public_bookable?: boolean | null;
  tutor?: { full_name?: string | null };
};

export type SessionTimeSlice = {
  start_time: Date | string;
  end_time: Date | string;
  status?: string | null;
};

/** One-time rows for a date override recurring rules for the same tutor on that day. */
export function effectiveAvailabilityOnDate(
  availability: AvailabilityCalendarRow[],
  dateStr: string,
  dayOfWeek: number,
): AvailabilityCalendarRow[] {
  const specific = availability.filter((a) => !a.is_recurring && a.specific_date === dateStr);
  const tutorsWithOverride = new Set(specific.map((a) => a.tutor_id));
  const recurring = availability.filter((a) => {
    if (!a.is_recurring || a.day_of_week === null) return false;
    if (tutorsWithOverride.has(a.tutor_id)) return false;
    return recurringAvailabilityAppliesOnDate(a, dateStr, dayOfWeek);
  });
  return [...specific, ...recurring];
}

export function sliceTimeRangeBySessions<T extends { start: Date; end: Date }>(
  block: T,
  sessions: SessionTimeSlice[],
): T[] {
  let freeBlocks: T[] = [block];
  const overlapping = sessions.filter(
    (s) => s.status !== 'cancelled' && s.start_time < block.end && s.end_time > block.start,
  );

  for (const session of overlapping) {
    const sessionStart = session.start_time instanceof Date ? session.start_time : new Date(session.start_time);
    const sessionEnd = session.end_time instanceof Date ? session.end_time : new Date(session.end_time);
    const next: T[] = [];
    for (const freeBlock of freeBlocks) {
      if (sessionStart < freeBlock.end && sessionEnd > freeBlock.start) {
        if (sessionStart > freeBlock.start) {
          next.push({ ...freeBlock, end: sessionStart });
        }
        if (sessionEnd < freeBlock.end) {
          next.push({ ...freeBlock, start: sessionEnd });
        }
      } else {
        next.push(freeBlock);
      }
    }
    freeBlocks = next.filter((seg) => seg.end.getTime() - seg.start.getTime() > 0);
  }

  return freeBlocks;
}
