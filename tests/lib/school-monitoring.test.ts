import { describe, expect, it } from 'vitest';
import { schoolMeetingCounts, schoolStudentAttendance } from '../../src/lib/schoolSessionMonitoring';
import { fetchAllRows } from '../../src/lib/fetchAllRows';
import { schoolDate, schoolCalendarWallDate, schoolCalendarInstant } from '../../src/lib/schoolTime';
import { format, addDays } from 'date-fns';

describe('school calendar time', () => {
  it('uses the requested host timezone during this regression run', () => {
    if (process.env.TZ === 'Asia/Kolkata') expect(new Date('2026-09-08T08:15:00Z').getTimezoneOffset()).toBe(-330);
  });
  it('shows and edits Lithuanian wall time without changing the instant', () => {
    const instant = schoolDate('2026-09-08T08:15:00Z');
    expect(format(instant, 'HH:mm')).toBe('11:15');
    const wall = schoolCalendarWallDate(instant);
    expect(wall.getHours()).toBe(11);
    expect(wall.getMinutes()).toBe(15);
    expect(schoolCalendarInstant(wall).getTime()).toBe(instant.getTime());
    expect(schoolDate('2026-09-08T11:15').getTime()).toBe(instant.getTime());
  });
  it('preserves local lesson times across Lithuanian daylight-saving changes', () => {
    const before = schoolDate('2026-10-24T11:15');
    const after = addDays(before, 2);
    expect(format(after, 'HH:mm')).toBe('11:15');
    expect(new Date(after).toISOString()).toBe('2026-10-26T09:15:00.000Z');
    expect(new Date(schoolDate('2026-01-08T11:15')).toISOString()).toBe('2026-01-08T09:15:00.000Z');
  });
});

describe('school monitoring', () => {
  const group = { class_group_id: 'group', tutor_id: 'teacher', start_time: '2026-01-01T10:00:00Z' };
  it('counts one meeting for a group, without counting an absent child as another conducted meeting', () => {
    expect(schoolMeetingCounts([
      { ...group, id: '1', status: 'completed' },
      { ...group, id: '2', status: 'completed' },
      { ...group, id: '3', status: 'no_show' },
      { ...group, id: '4', start_time: '2026-01-02T10:00:00Z', status: 'no_show' },
      { id: '5', status: 'cancelled' },
    ])).toEqual({ completed: 1, no_show: 1, cancelled: 1, active: 0 });
  });
  it('does not invent attendance from a completed status or a missing click', () => {
    const rows = [
      { ...group, student_id: 'a', status: 'completed' },
      { ...group, student_id: 'a', status: 'completed', student_joined_at: '2026-01-01T10:01:00Z' },
      { ...group, student_id: 'a', status: 'completed', status_confirmed_at: '2026-01-01T12:00:00Z' },
      { ...group, student_id: 'a', status: 'no_show' },
      { ...group, student_id: 'a', status: 'cancelled' },
    ];
    expect(schoolStudentAttendance(rows)[0]).toMatchObject({ joined: 2, unconfirmed: 1, noShow: 1, cancelled: 1 });
  });
  it('reads beyond server page caps and does not silently swallow errors', async () => {
    const source = Array.from({ length: 1307 }, (_, id) => ({ id }));
    const rows = await fetchAllRows(async (from) => ({ data: source.slice(from, from + 200), error: null }));
    expect(rows).toEqual(source);
    await expect(fetchAllRows(async () => ({ data: null, error: { message: 'denied' } }))).rejects.toThrow('denied');
  });
});
