import { describe, expect, it } from 'vitest';
import { groupToWriteDraft, validMemberSchedules } from '../../src/lib/schoolClassGroups';
const slot = { weekday: 1, start_time: '16:00', end_time: '16:45' };
const draft = groupToWriteDraft({ id: 'g1', name: 'Group', tutor_id: 't1', school_year_start: '2026-09-01', school_year_end: '2027-06-01', slots: [slot], members: [{ student_id: 's1', schedule_slots: [slot] }] });
describe('member schedules', () => {
  it('preserves an existing member selection when opening the edit form', () => {
    expect(draft.member_schedules).toEqual({ s1: [slot] });
    expect(validMemberSchedules(draft)).toBe(true);
  });
  it('rejects empty schedules, foreign students and times outside the group', () => {
    expect(validMemberSchedules({ ...draft, member_schedules: { s1: [] } })).toBe(false);
    expect(validMemberSchedules({ ...draft, member_schedules: { outsider: [slot] } })).toBe(false);
    expect(validMemberSchedules({ ...draft, member_schedules: { s1: [{ ...slot, weekday: 2 }] } })).toBe(false);
  });
});
