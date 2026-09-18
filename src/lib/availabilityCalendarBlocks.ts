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
  const overlapping = sessions.flatMap((session) => {
    if (session.status === 'cancelled') return [];

    const start = session.start_time instanceof Date
      ? session.start_time
      : new Date(session.start_time);
    const end = session.end_time instanceof Date
      ? session.end_time
      : new Date(session.end_time);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return [];
    if (start >= block.end || end <= block.start) return [];

    return [{ start, end }];
  });

  for (const session of overlapping) {
    const next: T[] = [];
    for (const freeBlock of freeBlocks) {
      if (session.start < freeBlock.end && session.end > freeBlock.start) {
        if (session.start > freeBlock.start) {
          next.push({ ...freeBlock, end: session.start });
        }
        if (session.end < freeBlock.end) {
          next.push({ ...freeBlock, start: session.end });
        }
      } else {
        next.push(freeBlock);
      }
    }
    freeBlocks = next.filter((seg) => seg.end.getTime() - seg.start.getTime() > 0);
  }

  return freeBlocks;
}
