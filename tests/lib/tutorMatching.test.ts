import { describe, it, expect } from 'vitest';
import { startOfDay, format } from 'date-fns';
import {
  computeTutorSlots,
  groupAndRankTutors,
  subtractBusyFromMatchSlots,
  type AvailabilityRule,
  type MatchSubject,
  type MatchSlot,
} from '../../src/lib/tutorMatching';

const NAMES: Record<string, string> = { t1: 'Alice', t2: 'Bob' };
const subjMath: MatchSubject = { id: 'math', name: 'Math', price: 20, tutor_id: 't1' };
const subjPhys: MatchSubject = { id: 'phys', name: 'Physics', price: 25, tutor_id: 't1' };

// computeTutorSlots iterates `startOfDay(new Date(dateFrom))` and matches on its
// local getDay(); deriving the expected weekday the same way keeps the fixtures
// timezone-independent.
function dayInfo(dateStr: string): { dow: number; dateStr: string; day: Date } {
  const day = startOfDay(new Date(dateStr));
  return { dow: day.getDay(), dateStr: format(day, 'yyyy-MM-dd'), day };
}

const ALL_DAY = { timeFrom: '00:00', timeTo: '23:59' };

describe('computeTutorSlots', () => {
  const { dow, day } = dayInfo('2026-01-05');
  const params = { dateFrom: '2026-01-05', dateTo: '2026-01-05', ...ALL_DAY };
  const recurring: AvailabilityRule = {
    tutor_id: 't1',
    day_of_week: dow,
    start_time: '09:00',
    end_time: '17:00',
    is_recurring: true,
  };

  it('honours multiple weekday-specific preferred time windows', () => {
    const monday = dayInfo('2026-07-06');
    const thursday = dayInfo('2026-07-09');
    const slots = computeTutorSlots([
      { ...recurring, day_of_week: monday.dow, start_time: '09:00', end_time: '21:00' },
      { ...recurring, day_of_week: thursday.dow, start_time: '09:00', end_time: '21:00' },
    ], [], [subjMath], NAMES, {
      dateFrom: monday.dateStr,
      dateTo: '2026-07-12',
      ...ALL_DAY,
      preferredWindows: [
        { dayOfWeek: monday.dow, startTime: '12:00', endTime: '14:00' },
        { dayOfWeek: thursday.dow, startTime: '17:00', endTime: '20:00' },
      ],
    });

    expect(slots).toHaveLength(2);
    expect(slots.map((slot) => format(slot.start, 'HH:mm'))).toEqual(['12:00', '17:00']);
  });

  it('matches a recurring rule on the right weekday', () => {
    const slots = computeTutorSlots([recurring], [], [subjMath], NAMES, params);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      tutorId: 't1',
      subjectId: 'math',
      tutorName: 'Alice',
      subjectName: 'Math',
      price: 20,
    });
  });

  it('skips a recurring rule on a different weekday', () => {
    const other: AvailabilityRule = { ...recurring, day_of_week: (dow + 1) % 7 };
    expect(computeTutorSlots([other], [], [subjMath], NAMES, params)).toHaveLength(0);
  });

  it('narrows the slot to the requested time window', () => {
    const slots = computeTutorSlots([recurring], [], [subjMath], NAMES, {
      dateFrom: '2026-01-05',
      dateTo: '2026-01-05',
      timeFrom: '10:00',
      timeTo: '12:00',
    });
    expect(slots).toHaveLength(1);
    expect(format(slots[0].start, 'HH:mm')).toBe('10:00');
    expect(format(slots[0].end, 'HH:mm')).toBe('12:00');
  });

  it('excludes a slot that conflicts with a busy interval', () => {
    const busyStart = new Date(day);
    busyStart.setHours(9, 0, 0, 0);
    const busyEnd = new Date(day);
    busyEnd.setHours(18, 0, 0, 0);
    const slots = computeTutorSlots(
      [recurring],
      [{ tutor_id: 't1', start: busyStart, end: busyEnd }],
      [subjMath],
      NAMES,
      params,
    );
    expect(slots).toHaveLength(0);
  });

  it('keeps a slot when the busy interval is for a different tutor', () => {
    const busyStart = new Date(day);
    busyStart.setHours(9, 0, 0, 0);
    const busyEnd = new Date(day);
    busyEnd.setHours(18, 0, 0, 0);
    const slots = computeTutorSlots(
      [recurring],
      [{ tutor_id: 't2', start: busyStart, end: busyEnd }],
      [subjMath],
      NAMES,
      params,
    );
    expect(slots).toHaveLength(1);
  });

  const busyAt = (fromH: number, toH: number) => {
    const start = new Date(day);
    start.setHours(fromH, 0, 0, 0);
    const end = new Date(day);
    end.setHours(toH, 0, 0, 0);
    return { tutor_id: 't1', start, end };
  };

  it('splits the window around a booked lesson instead of dropping the whole day', () => {
    const slots = computeTutorSlots([recurring], [busyAt(12, 13)], [subjMath], NAMES, params);
    expect(slots).toHaveLength(2);
    expect(format(slots[0].start, 'HH:mm')).toBe('09:00');
    expect(format(slots[0].end, 'HH:mm')).toBe('12:00');
    expect(format(slots[1].start, 'HH:mm')).toBe('13:00');
    expect(format(slots[1].end, 'HH:mm')).toBe('17:00');
  });

  it('trims a busy interval touching the window edge to a single remaining fragment', () => {
    const startBusy = computeTutorSlots([recurring], [busyAt(9, 10)], [subjMath], NAMES, params);
    expect(startBusy).toHaveLength(1);
    expect(format(startBusy[0].start, 'HH:mm')).toBe('10:00');
    expect(format(startBusy[0].end, 'HH:mm')).toBe('17:00');

    const endBusy = computeTutorSlots([recurring], [busyAt(16, 17)], [subjMath], NAMES, params);
    expect(endBusy).toHaveLength(1);
    expect(format(endBusy[0].start, 'HH:mm')).toBe('09:00');
    expect(format(endBusy[0].end, 'HH:mm')).toBe('16:00');
  });

  it('produces a fragment per gap with multiple booked lessons', () => {
    const slots = computeTutorSlots(
      [recurring],
      [busyAt(10, 11), busyAt(13, 14)],
      [subjMath],
      NAMES,
      params,
    );
    expect(slots.map((s) => `${format(s.start, 'HH:mm')}-${format(s.end, 'HH:mm')}`)).toEqual([
      '09:00-10:00',
      '11:00-13:00',
      '14:00-17:00',
    ]);
  });

  it('drops fragments too short for the subject duration', () => {
    // Window 09:00-10:30 with 09:00-10:00 busy leaves a 30-minute fragment.
    const shortWindow: AvailabilityRule = { ...recurring, start_time: '09:00', end_time: '10:30' };
    const long: MatchSubject = { ...subjMath, duration_minutes: 90 };
    expect(computeTutorSlots([shortWindow], [busyAt(9, 10)], [long], NAMES, params)).toHaveLength(0);
    const short: MatchSubject = { ...subjMath, duration_minutes: 30 };
    const slots = computeTutorSlots([shortWindow], [busyAt(9, 10)], [short], NAMES, params);
    expect(slots).toHaveLength(1);
    expect(format(slots[0].start, 'HH:mm')).toBe('10:00');
    expect(format(slots[0].end, 'HH:mm')).toBe('10:30');
  });

  it('applies the duration fit per subject (null duration defaults to 60 min)', () => {
    // 90-minute free fragment: fits the default-60 subject, not the 120-minute one.
    const window90: AvailabilityRule = { ...recurring, start_time: '09:00', end_time: '10:30' };
    const twoHour: MatchSubject = { id: 'chem', name: 'Chemistry', price: 30, tutor_id: 't1', duration_minutes: 120 };
    const slots = computeTutorSlots([window90], [], [subjMath, twoHour], NAMES, params);
    expect(slots).toHaveLength(1);
    expect(slots[0].subjectId).toBe('math');
  });

  it('honours one-time (specific_date) availability with is_recurring=false', () => {
    const { dateStr } = dayInfo('2026-01-05');
    const oneTime: AvailabilityRule = {
      tutor_id: 't1',
      day_of_week: null,
      start_time: '09:00',
      end_time: '10:00',
      is_recurring: false,
      specific_date: dateStr,
    };
    expect(computeTutorSlots([oneTime], [], [subjMath], NAMES, params)).toHaveLength(1);
    const wrongDate: AvailabilityRule = { ...oneTime, specific_date: '2020-01-01' };
    expect(computeTutorSlots([wrongDate], [], [subjMath], NAMES, params)).toHaveLength(0);
  });

  it('filters by subject name when provided', () => {
    const all = computeTutorSlots([recurring], [], [subjMath, subjPhys], NAMES, params);
    expect(all).toHaveLength(2);
    const physOnly = computeTutorSlots([recurring], [], [subjMath, subjPhys], NAMES, {
      ...params,
      subjectName: 'Physics',
    });
    expect(physOnly).toHaveLength(1);
    expect(physOnly[0].subjectId).toBe('phys');
  });

  it('restricts to rule.subject_ids when the rule scopes subjects', () => {
    const restricted: AvailabilityRule = { ...recurring, subject_ids: ['phys'] };
    const slots = computeTutorSlots([restricted], [], [subjMath, subjPhys], NAMES, params);
    expect(slots).toHaveLength(1);
    expect(slots[0].subjectId).toBe('phys');
  });

  it('respects a recurring rule effective start_date in the future', () => {
    const future: AvailabilityRule = { ...recurring, start_date: '2030-01-01' };
    expect(computeTutorSlots([future], [], [subjMath], NAMES, params)).toHaveLength(0);
  });

  it('respects a recurring rule end_date in the past', () => {
    const ended: AvailabilityRule = { ...recurring, end_date: '2000-01-01' };
    expect(computeTutorSlots([ended], [], [subjMath], NAMES, params)).toHaveLength(0);
  });

  it('returns slots sorted by start time across a range', () => {
    // A full week range with a recurring rule produces one slot per matching weekday.
    const slots = computeTutorSlots([recurring], [], [subjMath], NAMES, {
      dateFrom: '2026-01-05',
      dateTo: '2026-01-18',
      ...ALL_DAY,
    });
    expect(slots.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < slots.length; i++) {
      expect(slots[i].start.getTime()).toBeGreaterThanOrEqual(slots[i - 1].start.getTime());
    }
  });
});

describe('subtractBusyFromMatchSlots', () => {
  const makeSlot = (startHour: number, endHour: number): MatchSlot => ({
    tutorId: 't1',
    subjectId: 'math',
    tutorName: 'Alice',
    subjectName: 'Math',
    price: 20,
    durationMinutes: 60,
    start: new Date(2026, 6, 13, startHour),
    end: new Date(2026, 6, 13, endHour),
  });

  it('removes an exactly booked lesson from the visible search results', () => {
    const slot = makeSlot(16, 17);
    expect(subtractBusyFromMatchSlots([slot], [{
      tutor_id: 't1',
      start: new Date(2026, 6, 13, 16),
      end: new Date(2026, 6, 13, 17),
    }])).toEqual([]);
  });

  it('keeps the free parts of a larger window after a lesson is booked', () => {
    const result = subtractBusyFromMatchSlots([makeSlot(16, 20)], [{
      tutor_id: 't1',
      start: new Date(2026, 6, 13, 17),
      end: new Date(2026, 6, 13, 18),
    }]);

    expect(result.map((slot) => [slot.start.getHours(), slot.end.getHours()])).toEqual([
      [16, 17],
      [18, 20],
    ]);
  });
});

describe('groupAndRankTutors', () => {
  // Local Date constructor avoids UTC-parse day shifts; Jan 5-7 2026 = Mon-Wed
  // (same ISO week), Jan 12 2026 is the next Monday.
  const localDate = (day: number, hour = 10) => new Date(2026, 0, day, hour, 0, 0, 0);
  const slot = (tutorId: string, start: Date, subjectId = 'math'): MatchSlot => ({
    tutorId,
    subjectId,
    tutorName: NAMES[tutorId] ?? tutorId,
    subjectName: 'Math',
    price: 20,
    start,
    end: new Date(start.getTime() + 3_600_000),
  });

  it('ranks the student primary tutor first', () => {
    const slots = [slot('t1', localDate(5)), slot('t2', localDate(6))];
    const groups = groupAndRankTutors(slots, { frequencyPerWeek: 1, primaryTutorId: 't2' });
    expect(groups[0].tutorId).toBe('t2');
    expect(groups[0].isPrimary).toBe(true);
    expect(groups[1].isPrimary).toBe(false);
  });

  it('computes weekly coverage as max distinct days within one ISO week', () => {
    const slots = [slot('t1', localDate(5)), slot('t1', localDate(6)), slot('t1', localDate(7))];
    const [g] = groupAndRankTutors(slots, { frequencyPerWeek: 1 });
    expect(g.weeklyCoverage).toBe(3);
  });

  it('counts multiple slots on the same day as one covered day', () => {
    const slots = [slot('t1', localDate(5, 10)), slot('t1', localDate(5, 12))];
    const [g] = groupAndRankTutors(slots, { frequencyPerWeek: 1 });
    expect(g.weeklyCoverage).toBe(1);
  });

  it('does not let two days in different weeks add up', () => {
    const slots = [slot('t1', localDate(5)), slot('t1', localDate(12))];
    const [g] = groupAndRankTutors(slots, { frequencyPerWeek: 2 });
    expect(g.weeklyCoverage).toBe(1);
    expect(g.coversFrequency).toBe(false);
  });

  it('flags coversFrequency relative to the requested frequency', () => {
    const slots = [slot('t1', localDate(5)), slot('t1', localDate(6)), slot('t1', localDate(7))];
    expect(groupAndRankTutors(slots, { frequencyPerWeek: 2 })[0].coversFrequency).toBe(true);
    expect(groupAndRankTutors(slots, { frequencyPerWeek: 4 })[0].coversFrequency).toBe(false);
  });

  it('ranks a frequency-covering tutor above a non-covering one', () => {
    const slots = [
      slot('t1', localDate(5)),
      slot('t1', localDate(6)),
      slot('t1', localDate(7)),
      slot('t2', localDate(5)),
      slot('t2', localDate(6)),
    ];
    const groups = groupAndRankTutors(slots, { frequencyPerWeek: 3 });
    expect(groups[0].tutorId).toBe('t1');
    expect(groups[0].coversFrequency).toBe(true);
    expect(groups[1].coversFrequency).toBe(false);
  });

  it('ranks higher coverage first among non-covering tutors', () => {
    const slots = [
      slot('t1', localDate(5)),
      slot('t1', localDate(6)),
      slot('t2', localDate(5)),
      slot('t2', localDate(6)),
      slot('t2', localDate(7)),
    ];
    const groups = groupAndRankTutors(slots, { frequencyPerWeek: 5 });
    expect(groups[0].tutorId).toBe('t2');
    expect(groups[0].weeklyCoverage).toBe(3);
  });

  it('tie-breaks equal coverage by earliest availability', () => {
    const slots = [slot('t1', localDate(6)), slot('t2', localDate(5))];
    const groups = groupAndRankTutors(slots, { frequencyPerWeek: 1 });
    expect(groups[0].tutorId).toBe('t2');
  });

  it('defaults frequency to 1 when unspecified or invalid', () => {
    const slots = [slot('t1', localDate(5))];
    expect(groupAndRankTutors(slots)[0].coversFrequency).toBe(true);
    expect(groupAndRankTutors(slots, { frequencyPerWeek: 0 })[0].coversFrequency).toBe(true);
  });
});
