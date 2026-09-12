import { describe, expect, it } from 'vitest';
import {
  effectiveAvailabilityOnDate,
  sliceTimeRangeBySessions,
} from '@/lib/availabilityCalendarBlocks';

describe('availabilityCalendarBlocks', () => {
  it('prefers date-specific rows over recurring for the same tutor', () => {
    const availability = [
      {
        id: 'r1',
        tutor_id: 't1',
        is_recurring: true,
        specific_date: null,
        day_of_week: 4,
        start_time: '10:00',
        end_time: '16:00',
      },
      {
        id: 's1',
        tutor_id: 't1',
        is_recurring: false,
        specific_date: '2026-05-21',
        day_of_week: null,
        start_time: '10:00',
        end_time: '14:00',
      },
      {
        id: 's2',
        tutor_id: 't1',
        is_recurring: false,
        specific_date: '2026-05-21',
        day_of_week: null,
        start_time: '15:00',
        end_time: '16:00',
      },
    ];

    const rules = effectiveAvailabilityOnDate(availability, '2026-05-21', 4);
    expect(rules.map((r) => r.id)).toEqual(['s1', 's2']);
  });

  it('slices free time around an overlapping session', () => {
    const day = new Date(2026, 4, 21);
    const at = (hours: number, minutes = 0) => {
      const d = new Date(day);
      d.setHours(hours, minutes, 0, 0);
      return d;
    };

    const slices = sliceTimeRangeBySessions(
      { start: at(10), end: at(16) },
      [{ start_time: at(14), end_time: at(15), status: 'active' }],
    );

    expect(slices).toHaveLength(2);
    expect(slices[0].start.getHours()).toBe(10);
    expect(slices[0].end.getHours()).toBe(14);
    expect(slices[1].start.getHours()).toBe(15);
    expect(slices[1].end.getHours()).toBe(16);
  });
});
