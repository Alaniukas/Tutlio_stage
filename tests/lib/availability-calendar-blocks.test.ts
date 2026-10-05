import { describe, expect, it } from 'vitest';
import {
  effectiveAvailabilityOnDate,
  sliceTimeRangeBySessions,
} from '@/lib/availabilityCalendarBlocks';

describe('availabilityCalendarBlocks', () => {
  it('excludes the configured break on both sides of a lesson, including outside the block', () => {
    const at = (hours: number, minutes = 0) => new Date(2026, 9, 5, hours, minutes);
    expect(sliceTimeRangeBySessions(
      { start: at(18), end: at(19) },
      [{ start_time: at(19), end_time: at(20), status: 'active' }],
      10,
    )).toEqual([{ start: at(18), end: at(18, 50) }]);

    expect(sliceTimeRangeBySessions(
      { start: at(18, 10), end: at(20) },
      [{ start_time: at(17, 10), end_time: at(18, 10), status: 'active' }],
      10,
    )).toEqual([{ start: at(18, 20), end: at(20) }]);
  });

  it('does not reserve breaks around cancelled lessons', () => {
    const start = new Date(2026, 9, 5, 18);
    const end = new Date(2026, 9, 5, 19);
    expect(sliceTimeRangeBySessions(
      { start, end },
      [{ start_time: end, end_time: new Date(2026, 9, 5, 20), status: 'cancelled' }],
      10,
    )).toEqual([{ start, end }]);
  });

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

  it('removes a fully booked block when session timestamps come from the database as strings', () => {
    const start = new Date('2026-05-21T14:00:00.000Z');
    const end = new Date('2026-05-21T15:00:00.000Z');

    const slices = sliceTimeRangeBySessions(
      { start, end },
      [{
        start_time: '2026-05-21T14:00:00.000Z',
        end_time: '2026-05-21T15:00:00.000Z',
        status: 'active',
      }],
    );

    expect(slices).toEqual([]);
  });

  it('ignores invalid and cancelled session timestamps', () => {
    const start = new Date('2026-05-21T14:00:00.000Z');
    const end = new Date('2026-05-21T15:00:00.000Z');

    const slices = sliceTimeRangeBySessions(
      { start, end },
      [
        { start_time: 'invalid', end_time: 'invalid', status: 'active' },
        {
          start_time: '2026-05-21T14:30:00.000Z',
          end_time: '2026-05-21T14:00:00.000Z',
          status: 'active',
        },
        {
          start_time: '2026-05-21T14:00:00.000Z',
          end_time: '2026-05-21T15:00:00.000Z',
          status: 'cancelled',
        },
      ],
    );

    expect(slices).toEqual([{ start, end }]);
  });
});
