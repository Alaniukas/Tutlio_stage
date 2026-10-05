import { describe, expect, it } from 'vitest';
import { bookableAvailabilitySlotsOnDate } from '@/lib/availabilityBooking';

const day = '2026-11-11';
const at = (time: string) => new Date(`${day}T${time}:00`);
const options = { durationMs: 60 * 60000, earliest: at('00:00') };
const recurring = {
  id: 'weekly', tutor_id: 'tutor', is_recurring: true, specific_date: null,
  day_of_week: 3, start_time: '18:00:00', end_time: '20:00:00',
};
const specific = {
  ...recurring, id: 'one-time', is_recurring: false, specific_date: day,
  day_of_week: null, end_time: '19:00:00',
};
const times = (slots: ReturnType<typeof bookableAvailabilitySlotsOnDate>) =>
  slots.map(s => [s.start.getTime(), s.end.getTime()]);

describe('bookableAvailabilitySlotsOnDate', () => {
  it('uses one-time availability instead of adding it to the weekly schedule', () => {
    expect(times(bookableAvailabilitySlotsOnDate([recurring, specific], day, [], options)))
      .toEqual([[at('18:00').getTime(), at('19:00').getTime()]]);
  });

  it('never offers the fully booked interval from the reported November 11 case', () => {
    const busy = ['17:00', '18:00', '19:00'].map((time, i) => ({
      start_time: at(time), end_time: at(`${18 + i}:00`), status: 'active',
    }));
    expect(bookableAvailabilitySlotsOnDate([recurring, specific], day, busy, options)).toEqual([]);
  });

  it('returns each candidate once even when legacy one-time rules overlap', () => {
    const wider = { ...specific, start_time: '17:00:00', end_time: '20:00:00' };
    const overlap = { ...specific, id: 'duplicate', end_time: '20:00:00' };
    const slots = bookableAvailabilitySlotsOnDate([recurring, wider, overlap], day, [], options);
    expect(slots).toHaveLength(5);
    expect(new Set(slots.map(s => s.start.getTime())).size).toBe(5);
    expect(slots[0].start).toEqual(at('17:00'));
    expect(slots[4].start).toEqual(at('19:00'));
  });

  it('restores original availability after cancellation', () => {
    const busy = [{ start_time: at('18:00'), end_time: at('19:00'), status: 'cancelled' }];
    expect(times(bookableAvailabilitySlotsOnDate([recurring, specific], day, busy, options)))
      .toEqual([[at('18:00').getTime(), at('19:00').getTime()]]);
  });

  it('respects notice, the original lesson and breaks on both sides of bookings', () => {
    const availability = [{ ...specific, start_time: '16:00:00', end_time: '22:00:00' }];
    const busy = [{ start_time: at('18:00'), end_time: at('19:00') }];
    const slots = bookableAvailabilitySlotsOnDate(availability, day, busy, {
      ...options, earliest: at('17:00'), breakMs: 15 * 60000, excludeStart: at('20:00').getTime(),
    });
    expect(slots.map(s => s.start.getTime())).toEqual([
      at('19:30').getTime(), at('20:30').getTime(), at('21:00').getTime(),
    ]);
  });

  it('honours the start and end dates of recurring schedules', () => {
    expect(bookableAvailabilitySlotsOnDate([{ ...recurring, start_date: '2026-11-12' }], day, [], options)).toEqual([]);
    expect(bookableAvailabilitySlotsOnDate([{ ...recurring, end_date: '2026-11-10' }], day, [], options)).toEqual([]);
  });

  it('does not revive a weekly rule when the date override only allows another subject', () => {
    const override = { ...specific, subject_ids: ['physics'] };
    expect(bookableAvailabilitySlotsOnDate([recurring, override], day, [], {
      ...options, subjectId: 'mathematics',
    })).toEqual([]);
    expect(bookableAvailabilitySlotsOnDate([recurring, override], day, [], {
      ...options, subjectId: 'physics',
    })).toHaveLength(1);
  });
});
