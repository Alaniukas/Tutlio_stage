import { describe, expect, it } from 'vitest';
import {
  combineLocalDateAndTime,
  defaultLessonRange,
  intervalsOverlap,
  lessonFitsAvailabilityWindow,
} from '../../src/lib/pickedAvailabilityTime';
import { preferredWindowFromDateRange } from '../../src/lib/studentAvailability';

describe('picked availability exact times', () => {
  it('combines local date and clock time', () => {
    const dt = combineLocalDateAndTime('2026-09-01', '16:05');
    expect(dt).not.toBeNull();
    expect(dt!.getFullYear()).toBe(2026);
    expect(dt!.getMonth()).toBe(8);
    expect(dt!.getDate()).toBe(1);
    expect(dt!.getHours()).toBe(16);
    expect(dt!.getMinutes()).toBe(5);
  });

  it('defaults the lesson to subject duration inside the free window', () => {
    const windowStart = new Date(2026, 8, 1, 16, 0, 0, 0);
    const windowEnd = new Date(2026, 8, 1, 18, 0, 0, 0);
    const { start, end } = defaultLessonRange(windowStart, windowEnd, 45);
    expect(start.getTime()).toBe(windowStart.getTime());
    expect(end.getHours()).toBe(16);
    expect(end.getMinutes()).toBe(45);
  });

  it('clamps default end to the window', () => {
    const windowStart = new Date(2026, 8, 1, 17, 30, 0, 0);
    const windowEnd = new Date(2026, 8, 1, 18, 0, 0, 0);
    const { end } = defaultLessonRange(windowStart, windowEnd, 60);
    expect(end.getTime()).toBe(windowEnd.getTime());
  });

  it('rejects a lesson that starts before the matched window', () => {
    const windowStart = new Date(2026, 8, 1, 16, 0, 0, 0);
    const windowEnd = new Date(2026, 8, 1, 18, 0, 0, 0);
    const lessonStart = new Date(2026, 8, 1, 15, 55, 0, 0);
    const lessonEnd = new Date(2026, 8, 1, 16, 40, 0, 0);
    expect(lessonFitsAvailabilityWindow(windowStart, windowEnd, lessonStart, lessonEnd)).toBe(false);
  });

  it('accepts an exact clock time inside the window', () => {
    const windowStart = new Date(2026, 8, 1, 16, 0, 0, 0);
    const windowEnd = new Date(2026, 8, 1, 18, 0, 0, 0);
    const lessonStart = new Date(2026, 8, 1, 16, 7, 0, 0);
    const lessonEnd = new Date(2026, 8, 1, 16, 52, 0, 0);
    expect(lessonFitsAvailabilityWindow(windowStart, windowEnd, lessonStart, lessonEnd)).toBe(true);
  });

  it('detects overlap with already created intervals', () => {
    expect(intervalsOverlap(100, 200, [{ start: 150, end: 250 }])).toBe(true);
    expect(intervalsOverlap(100, 200, [{ start: 200, end: 300 }])).toBe(false);
  });

  it('stores the matched window as a weekly preferred slot', () => {
    const start = new Date(2026, 8, 1, 16, 0, 0, 0);
    const end = new Date(2026, 8, 1, 18, 0, 0, 0);
    expect(preferredWindowFromDateRange(start, end)).toEqual({
      day_of_week: start.getDay(),
      start_time: '16:00',
      end_time: '18:00',
    });
  });
});
