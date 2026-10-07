import { describe, expect, it } from 'vitest';
import {
  isSchoolDashboardAttendanceAttention,
  isSchoolDashboardNotHeldAttention,
} from '../../src/lib/schoolSessionMonitoring';

describe('school dashboard attention helpers', () => {
  const now = new Date('2026-09-18T12:00:00.000Z');
  const held = {
    start_time: '2026-09-17T10:00:00.000Z',
    end_time: '2026-09-17T11:00:00.000Z',
    meeting_link: 'https://meet.google.com/abc',
    tutor_joined_at: '2026-09-17T10:02:00.000Z',
    student_joined_at: null,
  };

  it('keeps detected absences until an outcome is confirmed', () => {
    expect(isSchoolDashboardAttendanceAttention({ ...held, status: 'active' }, now)).toBe(true);
    expect(isSchoolDashboardAttendanceAttention({
      ...held,
      status: 'no_show',
      no_show_reason: 'missed_join',
    }, now)).toBe(true);
  });

  it('clears attendance attention after confirmation', () => {
    expect(isSchoolDashboardAttendanceAttention({
      ...held,
      status: 'no_show',
      no_show_reason: 'missed_join',
      status_confirmed_at: '2026-09-17T11:05:00.000Z',
    }, now)).toBe(false);
    expect(isSchoolDashboardAttendanceAttention({
      ...held,
      status: 'completed',
      status_confirmed_at: '2026-09-17T11:05:00.000Z',
      student_joined_at: '2026-09-17T10:03:00.000Z',
    }, now)).toBe(false);
  });

  it('drops confirmed no_show rows from the not-held review list', () => {
    expect(isSchoolDashboardNotHeldAttention({
      ...held,
      status: 'no_show',
      no_show_reason: 'missed_join',
    }, now)).toBe(true);
    expect(isSchoolDashboardNotHeldAttention({
      ...held,
      status: 'no_show',
      no_show_reason: 'missed_join',
      status_confirmed_at: '2026-09-17T11:05:00.000Z',
    }, now)).toBe(false);
  });
});
