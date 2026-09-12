/**
 * Count how many scheduled extra-lessons occur in the first service month (Vilnius TZ).
 * Used for Laisvi vaikai base_lessons_per_month prefill — not ×4 weeks.
 */

import type { ExtraLessonsScheduleSlot } from './extraLessonsContract';

const VILNIUS = 'Europe/Vilnius';
const WEEKDAY_TO_NUM: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

function parseIsoDate(iso: string): { y: number; m: number; d: number } | null {
  const m = String(iso || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function isoFromParts(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function weekdayVilnius(iso: string): number {
  const parts = parseIsoDate(iso);
  if (!parts) return -1;
  const noonUtc = new Date(Date.UTC(parts.y, parts.m - 1, parts.d, 10, 0, 0));
  const name = new Intl.DateTimeFormat('en-US', { timeZone: VILNIUS, weekday: 'long' }).format(noonUtc);
  return WEEKDAY_TO_NUM[name] ?? -1;
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m, 0).getDate();
}

function compareIso(a: string, b: string): number {
  return a.localeCompare(b);
}

function clampIso(date: string, min: string, max: string): boolean {
  return compareIso(date, min) >= 0 && compareIso(date, max) <= 0;
}

/** First calendar month of service (month of startDate, or current month if start empty). */
export function firstServiceMonthBounds(startDate: string, referenceIso?: string): { monthStart: string; monthEnd: string } | null {
  const ref = parseIsoDate(startDate) || parseIsoDate(referenceIso || '') || parseIsoDate(new Date().toISOString().slice(0, 10));
  if (!ref) return null;
  const monthStart = isoFromParts(ref.y, ref.m, 1);
  const monthEnd = isoFromParts(ref.y, ref.m, daysInMonth(ref.y, ref.m));
  return { monthStart, monthEnd };
}

export function countExtraLessonsInFirstMonth(params: {
  scheduleSlots: ExtraLessonsScheduleSlot[];
  startDate: string;
  endDate?: string;
  schoolYearEnd?: string;
  referenceIso?: string;
}): number {
  const slots = params.scheduleSlots || [];
  if (!slots.length) return 0;
  const weekdays = new Set(slots.map((s) => Number(s.weekday)));
  const bounds = firstServiceMonthBounds(params.startDate, params.referenceIso);
  if (!bounds) return 0;

  const start = String(params.startDate || '').trim() || bounds.monthStart;
  const endCandidates = [
    String(params.endDate || '').trim(),
    String(params.schoolYearEnd || '').trim(),
    bounds.monthEnd,
  ].filter(Boolean);
  const windowEnd = endCandidates.reduce((a, b) => (compareIso(a, b) <= 0 ? a : b));

  const rangeStart = compareIso(start, bounds.monthStart) > 0 ? start : bounds.monthStart;
  const rangeEnd = compareIso(windowEnd, bounds.monthEnd) < 0 ? windowEnd : bounds.monthEnd;
  if (compareIso(rangeStart, rangeEnd) > 0) return 0;

  const parts = parseIsoDate(bounds.monthStart);
  if (!parts) return 0;

  let count = 0;
  for (let day = 1; day <= daysInMonth(parts.y, parts.m); day += 1) {
    const iso = isoFromParts(parts.y, parts.m, day);
    if (!clampIso(iso, rangeStart, rangeEnd)) continue;
    if (weekdays.has(weekdayVilnius(iso))) count += 1;
  }
  return count;
}
