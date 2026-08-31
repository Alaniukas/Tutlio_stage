import { describe, expect, it } from 'vitest';
import { calculateSessionStats, isStudentNoShowSession } from '@/lib/session-stats';

const base = {
  id: 's1',
  tutor_id: 't1',
  student_id: 'st1',
  price: 20,
  meeting_link: 'https://meet.example/join',
  tutor_joined_at: '2026-08-31T08:00:00.000Z',
  student_joined_at: null as string | null,
};

describe('isStudentNoShowSession', () => {
  it('counts explicit no_show status', () => {
    expect(isStudentNoShowSession({
      ...base,
      start_time: '2026-08-31T08:00:00.000Z',
      end_time: '2026-08-31T08:45:00.000Z',
      status: 'no_show',
    })).toBe(true);
  });

  it('counts completed lesson where student never joined after grace', () => {
    const now = new Date('2026-08-31T09:00:00.000Z');
    expect(isStudentNoShowSession({
      ...base,
      start_time: '2026-08-31T08:00:00.000Z',
      end_time: '2026-08-31T08:45:00.000Z',
      status: 'completed',
    }, now)).toBe(true);
  });

  it('does not count when student joined on time', () => {
    const now = new Date('2026-08-31T09:00:00.000Z');
    expect(isStudentNoShowSession({
      ...base,
      student_joined_at: '2026-08-31T08:02:00.000Z',
      start_time: '2026-08-31T08:00:00.000Z',
      end_time: '2026-08-31T08:45:00.000Z',
      status: 'completed',
    }, now)).toBe(false);
  });
});

describe('calculateSessionStats', () => {
  it('includes attendance-based student no-shows in the counter', () => {
    const stats = calculateSessionStats([
      {
        ...base,
        start_time: '2026-08-31T08:00:00.000Z',
        end_time: '2026-08-31T08:45:00.000Z',
        status: 'completed',
      },
      {
        ...base,
        id: 's2',
        student_joined_at: '2026-08-31T10:02:00.000Z',
        start_time: '2026-08-31T10:00:00.000Z',
        end_time: '2026-08-31T10:45:00.000Z',
        status: 'completed',
      },
    ], null, null);

    expect(stats.totalStudentNoShow).toBe(1);
    expect(stats.totalSuccessful).toBe(1);
  });
});
