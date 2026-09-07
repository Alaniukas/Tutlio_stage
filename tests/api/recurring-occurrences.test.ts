import { describe, expect, it } from 'vitest';
import {
  buildRollingOccurrenceDates,
  recurringDurationMs,
  wallClockToUtc,
} from '../../api/_lib/recurringOccurrences';

describe('rolling recurring occurrence materialization', () => {
  it('builds only weekly dates inside the requested rolling window', () => {
    expect(buildRollingOccurrenceDates({
      start_date: '2026-07-06',
      start_time: '17:00:00',
      end_time: '18:00:00',
      frequency: 'weekly',
    }, '2026-07-10', '2026-08-03')).toEqual([
      '2026-07-13',
      '2026-07-20',
      '2026-07-27',
      '2026-08-03',
    ]);
  });

  it('keeps a monthly plan anchored to the original day with clamping', () => {
    expect(buildRollingOccurrenceDates({
      start_date: '2026-01-31',
      start_time: '17:00:00',
      end_time: '18:00:00',
      frequency: 'monthly',
    }, '2026-02-01', '2026-04-30')).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('converts Vilnius wall-clock time across daylight saving changes', () => {
    expect(wallClockToUtc('2026-01-12', '17:00:00').toISOString()).toBe('2026-01-12T15:00:00.000Z');
    expect(wallClockToUtc('2026-07-13', '17:00:00').toISOString()).toBe('2026-07-13T14:00:00.000Z');
  });

  it('calculates a same-day lesson duration', () => {
    expect(recurringDurationMs('17:00:00', '18:30:00')).toBe(90 * 60_000);
  });
});
