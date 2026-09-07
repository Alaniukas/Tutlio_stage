import { describe, it, expect } from 'vitest';
import {
  isSameCalendarMonth,
  rescheduleAnchorDate,
  endOfCalendarMonth,
} from '../../src/lib/monthlyPackages';

describe('isSameCalendarMonth', () => {
  it('is true for two dates in the same month and year', () => {
    expect(isSameCalendarMonth(new Date(2026, 5, 1), new Date(2026, 5, 30))).toBe(true);
  });

  it('is false across month or year boundaries', () => {
    expect(isSameCalendarMonth(new Date(2026, 5, 30), new Date(2026, 6, 1))).toBe(false);
    expect(isSameCalendarMonth(new Date(2026, 0, 15), new Date(2025, 0, 15))).toBe(false);
  });
});

describe('rescheduleAnchorDate', () => {
  it('prefers the original start when present (so repeated moves cannot drift months)', () => {
    const current = new Date('2026-06-20T10:00:00');
    const anchor = rescheduleAnchorDate('2026-06-03T10:00:00.000Z', current);
    expect(anchor.toISOString()).toBe(new Date('2026-06-03T10:00:00.000Z').toISOString());
  });

  it('falls back to the current start when original is missing or invalid', () => {
    const current = new Date('2026-06-20T10:00:00');
    expect(rescheduleAnchorDate(null, current)).toBe(current);
    expect(rescheduleAnchorDate(undefined, current)).toBe(current);
    expect(rescheduleAnchorDate('not-a-date', current)).toBe(current);
  });

  it('treats an anchored move into a new month as a different calendar month', () => {
    // First moved within June; trying to move to July must be blocked relative to June anchor.
    const anchor = rescheduleAnchorDate('2026-06-03T10:00:00', new Date('2026-06-25T10:00:00'));
    expect(isSameCalendarMonth(new Date('2026-07-01T10:00:00'), anchor)).toBe(false);
    expect(isSameCalendarMonth(new Date('2026-06-28T10:00:00'), anchor)).toBe(true);
  });
});

describe('endOfCalendarMonth', () => {
  it('returns the last millisecond of the month (local time)', () => {
    const eom = endOfCalendarMonth(new Date(2026, 1, 10)); // February 2026 (non-leap)
    expect(eom.getFullYear()).toBe(2026);
    expect(eom.getMonth()).toBe(1);
    expect(eom.getDate()).toBe(28);
    expect(eom.getHours()).toBe(23);
    expect(eom.getMinutes()).toBe(59);
  });

  it('handles 31-day and leap-year months', () => {
    expect(endOfCalendarMonth(new Date(2026, 6, 1)).getDate()).toBe(31); // July
    expect(endOfCalendarMonth(new Date(2024, 1, 1)).getDate()).toBe(29); // Feb 2024 leap
  });
});
