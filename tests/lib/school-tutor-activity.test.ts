import { describe, expect, it } from 'vitest';
import {
  schoolTutorActivityByTutorId,
  schoolTutorLastActivityAt,
} from '../../src/lib/schoolTutorActivity';

describe('schoolTutorActivity', () => {
  const now = new Date('2026-09-10T12:00:00Z');

  it('tracks the latest teacher confirmation or join timestamp', () => {
    expect(schoolTutorLastActivityAt([
      { tutor_id: 't1', status: 'completed', end_time: '2026-09-08T11:00:00Z', status_confirmed_at: '2026-09-08T11:05:00Z' },
      { tutor_id: 't1', status: 'completed', end_time: '2026-09-09T11:00:00Z', tutor_joined_at: '2026-09-09T10:58:00Z' },
    ])).toBe('2026-09-09T11:00:00.000Z');
  });

  it('aggregates unconfirmed attendance per tutor for the current month window', () => {
    const rows = [
      {
        tutor_id: 't1',
        class_group_id: 'group',
        student_id: 'a',
        start_time: '2026-09-10T09:00:00Z',
        end_time: '2026-09-10T10:00:00Z',
        status: 'active',
        meeting_link: 'https://meet.google.com/abc',
        tutor_joined_at: '2026-09-10T09:01:00Z',
      },
      {
        tutor_id: 't1',
        class_group_id: 'group',
        student_id: 'b',
        start_time: '2026-09-10T09:00:00Z',
        end_time: '2026-09-10T10:00:00Z',
        status: 'active',
        meeting_link: 'https://meet.google.com/abc',
        tutor_joined_at: '2026-09-10T09:01:00Z',
      },
      {
        tutor_id: 't2',
        class_group_id: 'group-2',
        student_id: 'c',
        start_time: '2026-09-09T09:00:00Z',
        end_time: '2026-09-09T10:00:00Z',
        status: 'completed',
        status_confirmed_at: '2026-09-09T10:05:00Z',
      },
    ];
    const byTutor = schoolTutorActivityByTutorId(rows, now);
    expect(byTutor.get('t1')).toMatchObject({ unconfirmedAttendance: 2 });
    expect(byTutor.get('t2')).toMatchObject({ unconfirmedAttendance: 0 });
  });
});
