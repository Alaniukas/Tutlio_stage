import { describe, expect, it } from 'vitest';
import { shouldMarkStudentNoShowFromMissedJoin } from '../../src/lib/schoolJoinNoShow';

describe('schoolJoinNoShow', () => {
  const start = '2026-08-26T10:00:00.000Z';

  it('marks no-show when student never joined and tutor did after grace', () => {
    expect(shouldMarkStudentNoShowFromMissedJoin({
      id: '1',
      start_time: start,
      end_time: '2026-08-26T10:45:00.000Z',
      status: 'active',
      meeting_link: 'https://meet.google.com/abc',
      student_joined_at: null,
      tutor_joined_at: '2026-08-26T10:02:00.000Z',
    }, new Date('2026-08-26T10:15:00.000Z'))).toBe(true);
  });

  it('does not mark when tutor also missing (lesson likely did not happen)', () => {
    expect(shouldMarkStudentNoShowFromMissedJoin({
      id: '1',
      start_time: start,
      status: 'active',
      meeting_link: 'https://meet.google.com/abc',
      student_joined_at: null,
      tutor_joined_at: null,
    }, new Date('2026-08-26T10:20:00.000Z'))).toBe(false);
  });

  it('does not mark offline lessons', () => {
    expect(shouldMarkStudentNoShowFromMissedJoin({
      id: '1',
      start_time: start,
      status: 'active',
      meeting_link: null,
      student_joined_at: null,
      tutor_joined_at: '2026-08-26T10:02:00.000Z',
    }, new Date('2026-08-26T10:20:00.000Z'))).toBe(false);
  });
});
