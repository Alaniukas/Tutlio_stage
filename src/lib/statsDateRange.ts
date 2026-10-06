/** Default org stats window: last 12 months through today (local day bounds). */
export function defaultStatsDateRange(): { start: Date; end: Date } {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setFullYear(start.getFullYear() - 1);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

/** Company/school stats landing window: this calendar month (matches dashboard). */
export function currentMonthStatsDateRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function normalizeStatsDateRange(start: Date, end: Date): { startIso: string; endIso: string } {
  const startBound = new Date(start);
  startBound.setHours(0, 0, 0, 0);
  const endBound = new Date(end);
  endBound.setHours(23, 59, 59, 999);
  return { startIso: startBound.toISOString(), endIso: endBound.toISOString() };
}

export function statsDateRangeKey(range: { start: Date; end: Date }): string {
  const { startIso, endIso } = normalizeStatsDateRange(range.start, range.end);
  return `${startIso}|${endIso}`;
}

export type StatsPeriodMode = 'historical' | 'forward' | 'spanning';

/** Whether the selected stats window is past-only, future-only, or includes today. */
export function resolveStatsPeriodMode(
  range: { start: Date; end: Date },
  now: Date = new Date(),
): StatsPeriodMode {
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const rangeStart = new Date(range.start);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(range.end);
  rangeEnd.setHours(23, 59, 59, 999);

  if (rangeStart > todayEnd) return 'forward';
  if (rangeEnd < todayStart) return 'historical';
  return 'spanning';
}
