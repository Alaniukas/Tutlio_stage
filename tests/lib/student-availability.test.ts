import { describe, expect, it } from 'vitest';
import {
  parsePreferredAvailability,
  pickGroupPreferredAvailability,
  toFindTutorWindows,
} from '../../src/lib/studentAvailability';

describe('parsePreferredAvailability', () => {
  it('accepts valid windows and sorts by day then start time', () => {
    const parsed = parsePreferredAvailability([
      { day_of_week: 3, start_time: '18:00', end_time: '20:00' },
      { day_of_week: 1, start_time: '16:00', end_time: '17:30' },
      { day_of_week: 3, start_time: '08:00', end_time: '09:00' },
    ]);
    expect(parsed).toEqual([
      { day_of_week: 1, start_time: '16:00', end_time: '17:30' },
      { day_of_week: 3, start_time: '08:00', end_time: '09:00' },
      { day_of_week: 3, start_time: '18:00', end_time: '20:00' },
    ]);
  });

  it('drops garbage: bad days, bad times, inverted ranges, non-objects', () => {
    expect(parsePreferredAvailability(null)).toEqual([]);
    expect(parsePreferredAvailability('not-an-array')).toEqual([]);
    expect(
      parsePreferredAvailability([
        { day_of_week: 7, start_time: '16:00', end_time: '18:00' },
        { day_of_week: 2, start_time: '25:00', end_time: '26:00' },
        { day_of_week: 2, start_time: '18:00', end_time: '16:00' },
        { day_of_week: 2, start_time: '18:00', end_time: '18:00' },
        'junk',
        null,
      ]),
    ).toEqual([]);
  });

  it('keeps day 0 (Sunday) and midnight-adjacent times', () => {
    expect(
      parsePreferredAvailability([{ day_of_week: 0, start_time: '00:00', end_time: '23:59' }]),
    ).toEqual([{ day_of_week: 0, start_time: '00:00', end_time: '23:59' }]);
  });
});

describe('pickGroupPreferredAvailability', () => {
  it('returns the first row with non-empty windows', () => {
    const rows = [
      { preferred_availability: null },
      { preferred_availability: [{ day_of_week: 5, start_time: '15:00', end_time: '19:00' }] },
      { preferred_availability: [{ day_of_week: 1, start_time: '10:00', end_time: '12:00' }] },
    ];
    expect(pickGroupPreferredAvailability(rows)).toEqual([
      { day_of_week: 5, start_time: '15:00', end_time: '19:00' },
    ]);
  });

  it('returns [] when no row has windows', () => {
    expect(pickGroupPreferredAvailability([{ preferred_availability: [] }, {}])).toEqual([]);
  });
});

describe('toFindTutorWindows', () => {
  it('maps to the FindTutorModal prop shape', () => {
    expect(
      toFindTutorWindows([{ day_of_week: 2, start_time: '16:00', end_time: '20:00' }]),
    ).toEqual([{ dayOfWeek: 2, startTime: '16:00', endTime: '20:00' }]);
  });
});
