/** Exact lesson times inside a matched tutor availability window. */

export function toLocalYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function toLocalHm(date: Date): string {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

export function combineLocalDateAndTime(ymd: string, hm: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hm)) return null;
  const [year, month, day] = ymd.split('-').map(Number);
  const [hour, minute] = hm.split(':').map(Number);
  const next = new Date(year, month - 1, day, hour, minute, 0, 0);
  return Number.isNaN(next.getTime()) ? null : next;
}

export function defaultLessonRange(
  windowStart: Date,
  windowEnd: Date,
  durationMinutes: number,
): { start: Date; end: Date } {
  const durMs = Math.max(5, durationMinutes) * 60 * 1000;
  const start = new Date(windowStart.getTime());
  const idealEnd = start.getTime() + durMs;
  const end = new Date(Math.min(idealEnd, windowEnd.getTime()));
  return { start, end };
}

export function lessonFitsAvailabilityWindow(
  windowStart: Date,
  windowEnd: Date,
  lessonStart: Date,
  lessonEnd: Date,
): boolean {
  return (
    lessonStart.getTime() >= windowStart.getTime() &&
    lessonEnd.getTime() <= windowEnd.getTime() &&
    lessonStart.getTime() < lessonEnd.getTime()
  );
}

export function intervalsOverlap(
  startMs: number,
  endMs: number,
  busy: Array<{ start: number; end: number }>,
): boolean {
  return busy.some((item) => endMs > item.start && startMs < item.end);
}
