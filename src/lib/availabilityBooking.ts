import { effectiveAvailabilityOnDate, type AvailabilityCalendarRow, type SessionTimeSlice } from './availabilityCalendarBlocks';

type AvailabilityRule = AvailabilityCalendarRow & { created_at?: string | null };

type TimeRange = { start: Date; end: Date };

/** Multiple source rules can produce the same displayed or bookable interval. */
export function uniqueTimeRanges<T extends TimeRange>(ranges: T[]): T[] {
  const seen = new Set<string>();
  return ranges.filter(({ start, end }) => {
    const key = `${start.getTime()}_${end.getTime()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function bookableAvailabilitySlotsOnDate(
  availability: AvailabilityRule[],
  dateStr: string,
  occupied: SessionTimeSlice[],
  options: { durationMs: number; earliest: Date; breakMs?: number; excludeStart?: number; subjectId?: string },
): TimeRange[] {
  if (!Number.isFinite(options.durationMs) || options.durationMs <= 0) return [];
  const day = new Date(`${dateStr}T00:00:00`);
  const rules = effectiveAvailabilityOnDate(availability, dateStr, day.getDay());
  const breakMs = Math.max(0, options.breakMs ?? 0);
  const busy = occupied.filter((s) => s.status !== 'cancelled').map((s) => ({
    start: new Date(s.start_time).getTime() - breakMs,
    end: new Date(s.end_time).getTime() + breakMs,
  }));
  const slots: TimeRange[] = [];
  for (const rule of rules) {
    if (options.subjectId && rule.subject_ids?.length && !rule.subject_ids.includes(options.subjectId)) continue;
    const windowEnd = new Date(`${dateStr}T${rule.end_time}`).getTime();
    for (let start = new Date(`${dateStr}T${rule.start_time}`).getTime();
      start + options.durationMs <= windowEnd; start += 30 * 60000) {
      const end = start + options.durationMs;
      if (start < options.earliest.getTime() || start === options.excludeStart) continue;
      if (busy.some((s) => start < s.end && end > s.start)) continue;
      slots.push({ start: new Date(start), end: new Date(end) });
    }
  }
  return uniqueTimeRanges(slots).sort((a, b) => a.start.getTime() - b.start.getTime());
}
