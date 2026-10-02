import { endOfDay, endOfMonth, endOfWeek, startOfDay, startOfMonth, startOfWeek, subDays, addDays } from 'date-fns';

type ScheduleView = 'day' | 'week' | 'month' | string;

export function scheduleFetchWindow(
  anchorDate: Date,
  view: ScheduleView,
  opts: { paddingDays?: number; weekStartsOn?: 0 | 1 } = {},
): { start: Date; end: Date } {
  const paddingDays = opts.paddingDays ?? 7;
  const weekStartsOn = opts.weekStartsOn ?? 1;

  let rangeStart: Date;
  let rangeEnd: Date;

  if (view === 'month') {
    rangeStart = startOfMonth(anchorDate);
    rangeEnd = endOfMonth(anchorDate);
  } else if (view === 'week') {
    rangeStart = startOfWeek(anchorDate, { weekStartsOn });
    rangeEnd = endOfWeek(anchorDate, { weekStartsOn });
  } else {
    rangeStart = startOfDay(anchorDate);
    rangeEnd = endOfDay(anchorDate);
  }

  return {
    start: subDays(rangeStart, paddingDays),
    end: addDays(rangeEnd, paddingDays),
  };
}

export function scheduleFetchWindowKey(start: Date, end: Date): string {
  return `${start.toISOString().slice(0, 10)}_${end.toISOString().slice(0, 10)}`;
}
