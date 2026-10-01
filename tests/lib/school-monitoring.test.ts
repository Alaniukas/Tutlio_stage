import { describe, expect, it } from 'vitest';
import {
  schoolActivitySummary,
  schoolMeetingCounts,
  schoolMeetingOccurrences,
  schoolMeetings,
  schoolStudentAttendance,
} from '../../src/lib/schoolSessionMonitoring';
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
    expect(schoolStudentAttendance(rows)[0]).toMatchObject({ joined: 2, unconfirmed: 0, noShow: 1, cancelled: 1 });
  });
  it('separates meeting totals from child attendance totals', () => {
    const now = new Date('2026-09-10T12:00:00Z');
    const rows = [
      { ...group, id: '1', student_id: 'a', status: 'completed', status_confirmed_at: '2026-09-08T12:00:00Z', start_time: '2026-09-08T10:00:00Z', end_time: '2026-09-08T11:00:00Z' },
      { ...group, id: '2', student_id: 'b', status: 'no_show', start_time: '2026-09-08T10:00:00Z', end_time: '2026-09-08T11:00:00Z' },
      { ...group, id: '3', student_id: 'a', status: 'active', start_time: '2026-09-12T10:00:00Z', end_time: '2026-09-12T11:00:00Z' },
      { ...group, id: '4', student_id: 'b', status: 'active', start_time: '2026-09-12T10:00:00Z', end_time: '2026-09-12T11:00:00Z' },
      { ...group, id: '5', student_id: 'a', status: 'cancelled', start_time: '2026-09-09T10:00:00Z', end_time: '2026-09-09T11:00:00Z' },
      { ...group, id: '6', student_id: 'b', status: 'cancelled', start_time: '2026-09-09T10:00:00Z', end_time: '2026-09-09T11:00:00Z' },
    ];
    expect(schoolMeetingOccurrences(rows)).toHaveLength(3);
    expect(schoolActivitySummary(rows, now)).toEqual({
      scheduled: 2,
      completed: 1,
      upcoming: 1,
      noShowMeetings: 0,
      cancelled: 1,
      awaitingOutcome: 0,
      attendedStudents: 1,
      absentStudents: 1,
      unconfirmedStudents: 0,
      confirmedAttendance: 2,
      attendanceRate: 50,
    });
  });
  it('does not treat ended unmarked meetings as unconfirmed attendance without join evidence', () => {
    const now = new Date('2026-09-10T12:00:00Z');
    const rows = [
      { ...group, id: '1', student_id: 'a', status: 'active', start_time: '2026-09-10T09:00:00Z', end_time: '2026-09-10T10:00:00Z' },
      { ...group, id: '2', student_id: 'b', status: 'active', start_time: '2026-09-10T09:00:00Z', end_time: '2026-09-10T10:00:00Z' },
    ];
    expect(schoolActivitySummary(rows, now)).toMatchObject({
      scheduled: 1,
      upcoming: 0,
      awaitingOutcome: 1,
      unconfirmedStudents: 0,
      attendanceRate: null,
    });
  });
  it('counts unconfirmed attendance only when the system saw the child miss a held online lesson', () => {
    const now = new Date('2026-09-10T12:00:00Z');
    const occurrence = {
      ...group,
      meeting_link: 'https://meet.google.com/abc',
      tutor_joined_at: '2026-09-10T09:01:00Z',
      start_time: '2026-09-10T09:00:00Z',
      end_time: '2026-09-10T10:00:00Z',
    };
    const rows = [
      { ...occurrence, id: 'missed', student_id: 'a', status: 'active', student_joined_at: null },
      { ...occurrence, id: 'joined', student_id: 'b', status: 'active', student_joined_at: '2026-09-10T09:02:00Z' },
      { ...occurrence, id: 'no-lesson', student_id: 'c', status: 'active', tutor_joined_at: null, student_joined_at: null },
    ];
    expect(schoolActivitySummary(rows, now)).toMatchObject({
      unconfirmedStudents: 1,
      attendedStudents: 1,
      absentStudents: 0,
    });
  });
  it('treats a legacy automatic missed-join outcome as unconfirmed until a person confirms it', () => {
    const now = new Date('2026-09-10T12:00:00Z');
    const legacyAutomatic = {
      ...group,
      id: 'legacy-auto-no-show',
      student_id: 'a',
      status: 'no_show',
      no_show_reason: 'missed_join',
      status_confirmed_at: null,
      start_time: '2026-09-10T09:00:00Z',
      end_time: '2026-09-10T10:00:00Z',
    };

    expect(schoolActivitySummary([legacyAutomatic], now)).toMatchObject({
      noShowMeetings: 0,
      awaitingOutcome: 1,
      absentStudents: 0,
      unconfirmedStudents: 1,
      attendanceRate: null,
    });
    expect(schoolActivitySummary([{
      ...legacyAutomatic,
      status_confirmed_at: '2026-09-10T10:05:00Z',
    }], now)).toMatchObject({
      noShowMeetings: 1,
      awaitingOutcome: 0,
      absentStudents: 1,
      unconfirmedStudents: 0,
    });
  });
  it('does not request attendance confirmation before an activity has ended', () => {
    const now = new Date('2026-09-10T09:30:00Z');
    expect(schoolStudentAttendance([{
      ...group,
      id: 'ongoing',
      student_id: 'a',
      status: 'active',
      start_time: '2026-09-10T09:00:00Z',
      end_time: '2026-09-10T10:00:00Z',
    }], now)[0]).toMatchObject({ unconfirmed: 0 });
  });
  it('keeps elapsed automatic outcomes pending when manual confirmation is required, even after join clicks', () => {
    const now = new Date('2026-09-10T12:00:00Z');
    const rows = [{
      ...group,
      id: 'automatic-completed',
      student_id: 'a',
      status: 'completed',
      start_time: '2026-09-10T09:00:00Z',
      end_time: '2026-09-10T10:00:00Z',
      status_confirmed_at: null,
      student_joined_at: '2026-09-10T09:01:00Z',
    }, {
      id: 'automatic-no-show',
      student_id: 'b',
      status: 'no_show',
      start_time: '2026-09-10T09:00:00Z',
      end_time: '2026-09-10T10:00:00Z',
      status_confirmed_at: null,
    }];
    const options = { requireConfirmation: true };

    expect(schoolMeetings(rows, options).map(row => row.status)).toEqual(['active', 'active']);
    expect(schoolMeetingCounts(rows, options)).toEqual({ completed: 0, no_show: 0, cancelled: 0, active: 2 });
    expect(schoolActivitySummary(rows, now, options)).toMatchObject({
      completed: 0,
      noShowMeetings: 0,
      awaitingOutcome: 2,
      attendedStudents: 0,
      absentStudents: 0,
      unconfirmedStudents: 0,
      attendanceRate: null,
    });
    expect(rows.map(row => row.status)).toEqual(['completed', 'no_show']);
  });
  it('counts stamped tutor and administrator outcomes once per group, keeping other children pending or cancelled', () => {
    const now = new Date('2026-09-10T12:00:00Z');
    const occurrence = { ...group, start_time: '2026-09-10T09:00:00Z', end_time: '2026-09-10T10:00:00Z' };
    const rows = [
      { ...occurrence, id: 'tutor-confirmed', student_id: 'a', status: 'completed', status_confirmed_at: '2026-09-10T10:01:00Z' },
      { ...occurrence, id: 'admin-confirmed', student_id: 'b', status: 'completed', status_confirmed_at: '2026-09-10T10:02:00Z' },
      { ...occurrence, id: 'cancelled-child', student_id: 'c', status: 'cancelled' },
      { ...occurrence, id: 'unstamped-child', student_id: 'd', status: 'completed', status_confirmed_at: null },
      { id: 'confirmed-absence', student_id: 'e', status: 'no_show', status_confirmed_at: '2026-09-10T10:03:00Z', start_time: occurrence.start_time, end_time: occurrence.end_time },
      { id: 'cancelled-meeting', student_id: 'f', status: 'cancelled', start_time: occurrence.start_time, end_time: occurrence.end_time },
    ];
    const options = { requireConfirmation: true };

    expect(schoolMeetingCounts(rows, options)).toEqual({ completed: 1, no_show: 1, cancelled: 1, active: 0 });
    expect(schoolActivitySummary(rows, now, options)).toMatchObject({
      completed: 1,
      noShowMeetings: 1,
      cancelled: 1,
      attendedStudents: 2,
      absentStudents: 1,
      unconfirmedStudents: 0,
      confirmedAttendance: 3,
      attendanceRate: 67,
    });
    expect(schoolStudentAttendance(rows, now, options).find(student => student.id === 'c')).toMatchObject({ cancelled: 1 });
  });
  it('preserves other organizations automatic outcome counting unless the confirmation option is enabled', () => {
    const now = new Date('2026-09-10T12:00:00Z');
    const row = {
      id: 'automatic-other-org',
      student_id: 'a',
      status: 'completed',
      start_time: '2026-09-10T09:00:00Z',
      end_time: '2026-09-10T10:00:00Z',
      student_joined_at: '2026-09-10T09:01:00Z',
    };
    expect(schoolActivitySummary([row], now)).toMatchObject({ completed: 1, attendedStudents: 1, awaitingOutcome: 0 });
    expect(schoolActivitySummary([row], now, { requireConfirmation: false })).toEqual(schoolActivitySummary([row], now));
    expect(schoolActivitySummary([row], now, { requireConfirmation: true })).toMatchObject({ completed: 0, attendedStudents: 0, awaitingOutcome: 1 });
    expect(schoolActivitySummary([row], now, { requireConfirmation: true, countStoredCompleted: true })).toMatchObject({ completed: 1, awaitingOutcome: 0 });
  });
  it('reads beyond server page caps and does not silently swallow errors', async () => {
    const source = Array.from({ length: 1307 }, (_, id) => ({ id }));
    const rows = await fetchAllRows(async (from) => ({ data: source.slice(from, from + 200), error: null }));
    expect(rows).toEqual(source);
    await expect(fetchAllRows(async () => ({ data: null, error: { message: 'denied' } }))).rejects.toThrow('denied');
  });
});
