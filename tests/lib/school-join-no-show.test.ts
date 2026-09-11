import { describe, expect, it } from 'vitest';
import {
  shouldReviewStudentAttendanceFromMissingJoin,
  shouldRestoreAutomaticNoShowOnJoin,
} from '../../src/lib/schoolJoinNoShow';

describe('schoolJoinNoShow', () => {
  const start = '2026-08-26T10:00:00.000Z';

  it('flags attendance for review when student never joined and tutor did after grace', () => {
    expect(shouldReviewStudentAttendanceFromMissingJoin({
      id: '1',
      start_time: start,
      end_time: '2026-08-26T10:45:00.000Z',
      status: 'active',
      meeting_link: 'https://meet.google.com/abc',
      student_joined_at: null,
      tutor_joined_at: '2026-08-26T10:02:00.000Z',
    }, new Date('2026-08-26T10:15:00.000Z'))).toBe(true);
  });

  it('does not flag a student when tutor also appears missing', () => {
    expect(shouldReviewStudentAttendanceFromMissingJoin({
      id: '1',
      start_time: start,
      status: 'active',
      meeting_link: 'https://meet.google.com/abc',
      student_joined_at: null,
      tutor_joined_at: null,
    }, new Date('2026-08-26T10:20:00.000Z'))).toBe(false);
  });

  it('does not mark offline lessons', () => {
    expect(shouldReviewStudentAttendanceFromMissingJoin({
      id: '1',
      start_time: start,
      status: 'active',
      meeting_link: null,
      student_joined_at: null,
      tutor_joined_at: '2026-08-26T10:02:00.000Z',
    }, new Date('2026-08-26T10:20:00.000Z'))).toBe(false);
  });

  it('reopens only an unconfirmed automatic no-show when a tracked join arrives late', () => {
    expect(shouldRestoreAutomaticNoShowOnJoin({
      status: 'no_show',
      no_show_reason: 'missed_join',
      status_confirmed_at: null,
    })).toBe(true);
    expect(shouldRestoreAutomaticNoShowOnJoin({
      status: 'no_show',
      no_show_reason: 'missed_join',
      status_confirmed_at: '2026-08-26T10:12:00.000Z',
    })).toBe(false);
    expect(shouldRestoreAutomaticNoShowOnJoin({
      status: 'no_show',
      no_show_reason: null,
      status_confirmed_at: null,
    })).toBe(false);
  });
});
