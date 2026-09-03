import { describe, expect, it } from 'vitest';
import {
  calculateSessionStats,
  countCancellationAttribution,
  countUserInitiatedCancellations,
  formatCancellationBreakdown,
  isStudentNoShowSession,
} from '@/lib/session-stats';

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

describe('countCancellationAttribution', () => {
  it('Ona shape: 13 cancelled = K:3 M:1 A:9 (admin recurring cleanup)', () => {
    const rows = [
      ...Array.from({ length: 3 }, () => ({ status: 'cancelled', cancelled_by: 'tutor' })),
      { status: 'cancelled', cancelled_by: 'student' },
      ...Array.from({ length: 9 }, () => ({ status: 'cancelled', cancelled_by: null })),
    ];
    const counters = countCancellationAttribution(rows);
    expect(counters.totalCancelled).toBe(13);
    expect(counters.cancelledByTutor).toBe(3);
    expect(counters.cancelledByStudent).toBe(1);
    expect(counters.cancelledByAdmin).toBe(9);
    expect(formatCancellationBreakdown(counters, (role, count) => {
      if (role === 'tutor') return `K:${count}`;
      if (role === 'student') return `M:${count}`;
      return `A:${count}`;
    })).toBe('13 (K:3 M:1 A:9)');
    expect(countUserInitiatedCancellations(counters)).toBe(4);
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
