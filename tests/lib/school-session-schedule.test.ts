import { describe, expect, it } from 'vitest';
import { schoolGroupSessionFollowsSchedule } from '../../src/lib/schoolSessionSchedule';

const tuesday = [{ weekday: 2, start_time: '12:30' }];

describe('a child\'s group schedule', () => {
  it('uses Vilnius wall clock in summer and winter', () => {
    expect(schoolGroupSessionFollowsSchedule({ start_time: '2026-09-22T09:30:00Z' }, tuesday)).toBe(true);
    expect(schoolGroupSessionFollowsSchedule({ start_time: '2026-11-03T10:30:00Z' }, tuesday)).toBe(true);
    expect(schoolGroupSessionFollowsSchedule({ start_time: '2026-09-21T09:30:00Z' }, tuesday)).toBe(false);
  });

  it('distinguishes two slots on the same day and accepts legacy time seconds', () => {
    expect(schoolGroupSessionFollowsSchedule({ start_time: '2026-09-22T09:30:00Z' }, [{ weekday: 2, start_time: '12:30:00' }])).toBe(true);
    expect(schoolGroupSessionFollowsSchedule({ start_time: '2026-09-22T10:30:00Z' }, tuesday)).toBe(false);
  });

  it('follows the original slot when an occurrence moves to another day', () => {
    expect(schoolGroupSessionFollowsSchedule({ start_time: '2026-09-23T11:00:00Z', original_start_time: '2026-09-22T09:30:00Z' }, tuesday)).toBe(true);
    expect(schoolGroupSessionFollowsSchedule({ start_time: '2026-09-22T09:30:00Z', original_start_time: '2026-09-21T09:30:00Z' }, tuesday)).toBe(false);
  });

  it('keeps legacy unrestricted schedules and rejects invalid explicit selections', () => {
    expect(schoolGroupSessionFollowsSchedule({ start_time: '2026-09-21T09:30:00Z' }, null)).toBe(true);
    expect(schoolGroupSessionFollowsSchedule({ start_time: '2026-09-21T09:30:00Z' }, undefined)).toBe(true);
    expect(schoolGroupSessionFollowsSchedule({ start_time: '2026-09-22T09:30:00Z' }, [])).toBe(false);
    expect(schoolGroupSessionFollowsSchedule({ start_time: 'invalid' }, tuesday)).toBe(false);
    expect(schoolGroupSessionFollowsSchedule({ start_time: '2026-09-22T09:30:00Z' }, [{ weekday: 2, start_time: '25:30' }])).toBe(false);
  });

  it('assigns an after-midnight session to the local weekday', () => {
    expect(schoolGroupSessionFollowsSchedule({ start_time: '2026-09-21T21:30:00Z' }, [{ weekday: 2, start_time: '00:30' }])).toBe(true);
  });
});
