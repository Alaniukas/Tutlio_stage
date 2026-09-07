import { describe, expect, it } from 'vitest';
import {
  endOfMonthYmd,
  lessonsForMonthlyPeriod,
  monthlyPackagePeriodFrom,
  nextMonthFirstYmd,
} from '../../src/lib/monthlyPackagePlan';

describe('monthly package plan calculations', () => {
  it('prorates the first month from the plan creation date', () => {
    expect(monthlyPackagePeriodFrom('2026-07-10', 3)).toEqual({
      periodStart: '2026-07-10',
      periodEnd: '2026-07-31',
      totalLessons: 12,
      nextGenerationDate: '2026-08-01',
    });
  });

  it('counts a full 31-day month as five calendar-week blocks', () => {
    expect(lessonsForMonthlyPeriod('2026-08-01', '2026-08-31', 2)).toBe(10);
  });

  it('handles leap-year month boundaries', () => {
    expect(endOfMonthYmd('2028-02-07')).toBe('2028-02-29');
    expect(nextMonthFirstYmd('2028-02-07')).toBe('2028-03-01');
  });
});
