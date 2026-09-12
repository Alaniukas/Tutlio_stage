import { describe, expect, it } from 'vitest';
import { countExtraLessonsInFirstMonth } from '../../src/lib/extraLessonsMonthlyCount';

describe('countExtraLessonsInFirstMonth', () => {
  it('counts Tuesday occurrences in September 2026, not ×4', () => {
    const count = countExtraLessonsInFirstMonth({
      scheduleSlots: [{ weekday: 2, start_time: '16:00', end_time: '16:45' }],
      startDate: '2026-09-08',
      endDate: '2027-06-13',
    });
    expect(count).toBe(4);
  });

  it('sums multiple weekday slots in the same month', () => {
    const count = countExtraLessonsInFirstMonth({
      scheduleSlots: [
        { weekday: 1, start_time: '10:00', end_time: '10:45' },
        { weekday: 3, start_time: '10:00', end_time: '10:45' },
      ],
      startDate: '2026-09-01',
      endDate: '2027-06-13',
    });
    expect(count).toBe(9);
  });
});
