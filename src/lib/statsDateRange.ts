/** Default org stats window: last 12 months through today (local day bounds). */
export function defaultStatsDateRange(): { start: Date; end: Date } {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date();
  start.setFullYear(start.getFullYear() - 1);
  start.setHours(0, 0, 0, 0);
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
