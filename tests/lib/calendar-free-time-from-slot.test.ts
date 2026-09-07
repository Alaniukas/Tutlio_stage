import { describe, expect, it } from 'vitest';
import {
  buildRecurringFreeTimeRows,
  isValidTimeRange,
  resolveFreeTimeEndDate,
  timeRangesOverlap,
} from '@/lib/calendarFreeTimeFromSlot';

describe('calendar free time from slot', () => {
  it('computes inclusive end date from weeks', () => {
    expect(resolveFreeTimeEndDate({
      mode: 'weeks',
      untilDate: '',
      weeks: 4,
      fromDate: '2026-08-17',
    })).toBe('2026-09-13');
  });

  it('uses an explicit until date', () => {
    expect(resolveFreeTimeEndDate({
      mode: 'date',
      untilDate: '2026-12-20',
      weeks: 8,
      fromDate: '2026-08-17',
    })).toBe('2026-12-20');
  });

  it('builds one recurring row per weekday with custom times', () => {
    const rows = buildRecurringFreeTimeRows({
      tutorId: 't1',
      days: [1, 3],
      sameTimes: false,
      defaultStart: '10:00',
      defaultEnd: '12:00',
      dayTimes: { 3: { start: '14:00', end: '16:00' } },
      endDate: '2026-10-01',
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      day_of_week: 1,
      start_time: '10:00',
      end_time: '12:00',
      is_recurring: true,
      end_date: '2026-10-01',
    });
    expect(rows[1]).toMatchObject({
      day_of_week: 3,
      start_time: '14:00',
      end_time: '16:00',
    });
  });

  it('validates ranges and overlap', () => {
    expect(isValidTimeRange('10:00', '12:00')).toBe(true);
    expect(isValidTimeRange('12:00', '10:00')).toBe(false);
    expect(timeRangesOverlap('10:00', '12:00', '11:00', '13:00')).toBe(true);
    expect(timeRangesOverlap('10:00', '12:00', '12:00', '13:00')).toBe(false);
  });
});
