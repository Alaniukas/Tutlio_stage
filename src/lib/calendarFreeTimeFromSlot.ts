import { addDays, format, parseISO } from 'date-fns';

export type FreeTimeUntilMode = 'date' | 'weeks';

export type DayTime = { start: string; end: string };

export function timeToMinutes(time: string): number | null {
  const [hStr, mStr] = String(time).split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function timeRangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  const aS = timeToMinutes(aStart);
  const aE = timeToMinutes(aEnd);
  const bS = timeToMinutes(String(bStart).slice(0, 5));
  const bE = timeToMinutes(String(bEnd).slice(0, 5));
  if (aS === null || aE === null || bS === null || bE === null) return false;
  return aS < bE && aE > bS;
}

export function isValidTimeRange(start: string, end: string): boolean {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  return s !== null && e !== null && s < e;
}

/** Inclusive end date for a recurring free-time rule. */
export function resolveFreeTimeEndDate(opts: {
  mode: FreeTimeUntilMode;
  untilDate: string;
  weeks: number;
  fromDate: string;
}): string | null {
  if (opts.mode === 'date') {
    const d = opts.untilDate.trim();
    return d || null;
  }
  const weeks = Math.max(1, Math.min(52, Math.round(Number(opts.weeks)) || 8));
  const from = parseISO(opts.fromDate);
  if (Number.isNaN(from.getTime())) return null;
  return format(addDays(from, weeks * 7 - 1), 'yyyy-MM-dd');
}

export function timesForDay(
  day: number,
  sameTimes: boolean,
  defaultStart: string,
  defaultEnd: string,
  dayTimes: Record<number, DayTime>,
): DayTime {
  if (sameTimes) return { start: defaultStart, end: defaultEnd };
  return dayTimes[day] || { start: defaultStart, end: defaultEnd };
}

export function buildRecurringFreeTimeRows(opts: {
  tutorId: string;
  days: number[];
  sameTimes: boolean;
  defaultStart: string;
  defaultEnd: string;
  dayTimes: Record<number, DayTime>;
  endDate: string | null;
}): Array<Record<string, unknown>> {
  return opts.days.map((day) => {
    const times = timesForDay(day, opts.sameTimes, opts.defaultStart, opts.defaultEnd, opts.dayTimes);
    return {
      tutor_id: opts.tutorId,
      day_of_week: day,
      start_time: times.start,
      end_time: times.end,
      is_recurring: true,
      end_date: opts.endDate,
      subject_ids: [],
      public_bookable: false,
    };
  });
}
