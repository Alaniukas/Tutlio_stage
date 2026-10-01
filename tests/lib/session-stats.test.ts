import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  calculateSessionStats,
  calculateOrgSessionListStats,
  countCancellationAttribution,
  countUserInitiatedCancellations,
  countPastUnpaidSessions,
  formatCancellationBreakdown,
  getStudentRecentPastSessions,
  getStudentUpcomingSessions,
  isStudentNoShowSession,
  matchesOrgSessionStatChip,
  toggleOrgSessionStatChip,
  type Session,
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

  it('treats missing join tracking as a review hint when explicit confirmation is required', () => {
    const now = new Date('2026-08-31T09:00:00.000Z');
    expect(isStudentNoShowSession({
      ...base,
      start_time: '2026-08-31T08:00:00.000Z',
      end_time: '2026-08-31T08:45:00.000Z',
      status: 'completed',
    }, now, { requireExplicitNoShow: true })).toBe(false);
  });
});

describe('getStudentRecentPastSessions across tutor assignments', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T12:00:00.000Z'));
  });

  afterEach(() => vi.useRealTimers());

  const trial: Session = {
    ...base,
    id: 'old-tutor-trial',
    student_id: 'old-tutor-student',
    tutor_id: 'vakare',
    tutor: { full_name: 'Vakarė' },
    start_time: '2026-09-25T14:00:00.000Z',
    end_time: '2026-09-25T15:00:00.000Z',
    status: 'completed',
    topic: 'Bandomoji',
    paid: true,
    payment_status: 'paid',
  };
  const rows: Session[] = [
    trial,
    { ...trial, id: 'current-tutor-lesson', student_id: 'new-tutor-student', tutor_id: 'liepa', tutor: { full_name: 'Liepa' }, start_time: '2026-09-26T14:00:00.000Z', end_time: '2026-09-26T15:00:00.000Z' },
    { ...trial, id: 'recent-cancellation', status: 'cancelled', start_time: '2026-09-28T14:00:00.000Z', end_time: '2026-09-28T15:00:00.000Z' },
    { ...trial, id: 'older-lesson', start_time: '2026-09-20T14:00:00.000Z', end_time: '2026-09-20T15:00:00.000Z' },
    { ...trial, id: 'other-child', student_id: 'sibling-student', start_time: '2026-09-30T14:00:00.000Z', end_time: '2026-09-30T15:00:00.000Z' },
    { ...trial, id: 'future-lesson', status: 'active', start_time: '2026-10-02T14:00:00.000Z', end_time: '2026-10-02T15:00:00.000Z' },
    { ...trial, id: 'in-progress', status: 'active', start_time: '2026-10-01T11:00:00.000Z', end_time: '2026-10-01T13:00:00.000Z' },
    trial,
  ];

  it('returns the newest three from the child identity group and preserves the historical tutor/payment fields', () => {
    const result = getStudentRecentPastSessions(rows, ['new-tutor-student', 'old-tutor-student']);
    expect(result.map((row) => row.id)).toEqual(['recent-cancellation', 'current-tutor-lesson', 'old-tutor-trial']);
    expect(result[2]).toEqual(trial);
  });

  it('preserves single-student callers and does not include a sibling or duplicate history rows', () => {
    expect(getStudentRecentPastSessions(rows, 'old-tutor-student').map((row) => row.id))
      .toEqual(['recent-cancellation', 'old-tutor-trial', 'older-lesson']);
    expect(getStudentRecentPastSessions(rows, [])).toEqual([]);
  });
});

describe('getStudentUpcomingSessions', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T12:00:00.000Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('returns the next scheduled sessions when nothing has ended yet', () => {
    const rows: Session[] = [
      { ...base, id: 'future-2', student_id: 'child', start_time: '2026-10-10T14:00:00.000Z', end_time: '2026-10-10T15:00:00.000Z', status: 'active' },
      { ...base, id: 'future-1', student_id: 'child', start_time: '2026-10-05T14:00:00.000Z', end_time: '2026-10-05T15:00:00.000Z', status: 'active' },
      { ...base, id: 'other-child', student_id: 'other', start_time: '2026-10-06T14:00:00.000Z', end_time: '2026-10-06T15:00:00.000Z', status: 'active' },
    ];
    expect(getStudentUpcomingSessions(rows, ['child']).map((row) => row.id)).toEqual(['future-1', 'future-2']);
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

  it('counts only explicit no-show outcomes for manual-confirmation organizations', () => {
    const stats = calculateSessionStats([{
      ...base,
      start_time: '2026-08-31T08:00:00.000Z',
      end_time: '2026-08-31T08:45:00.000Z',
      status: 'completed',
    }], null, null, { requireExplicitNoShow: true });

    expect(stats.totalStudentNoShow).toBe(0);
    expect(stats.totalSuccessful).toBe(1);
  });
});

describe('calculateOrgSessionListStats', () => {
  it('counts future active lessons as upcoming and future cancelled as cancelled', () => {
    const nowYear = new Date().getFullYear() + 1;
    const stats = calculateOrgSessionListStats([
      {
        ...base,
        id: 'future-active',
        start_time: `${nowYear}-03-01T10:00:00.000Z`,
        end_time: `${nowYear}-03-01T10:45:00.000Z`,
        status: 'active',
      },
      {
        ...base,
        id: 'future-cancelled',
        start_time: `${nowYear}-03-02T10:00:00.000Z`,
        end_time: `${nowYear}-03-02T10:45:00.000Z`,
        status: 'cancelled',
        cancelled_by: 'tutor',
      },
    ]);
    expect(stats.totalUpcoming).toBe(1);
    expect(stats.totalCancelled).toBe(1);
    expect(stats.cancelledByTutor).toBe(1);
    expect(stats.totalSuccessful).toBe(0);
  });
});

describe('past unpaid session chip', () => {
  const now = new Date('2026-09-15T12:00:00.000Z');

  it('counts ended unpaid lessons and ignores future, paid, cancelled, complimentary', () => {
    const rows = [
      { ...base, id: 'past-unpaid', start_time: '2026-09-10T10:00:00.000Z', end_time: '2026-09-10T11:00:00.000Z', status: 'active' as const, paid: false, payment_status: 'pending' },
      { ...base, id: 'past-paid', start_time: '2026-09-10T10:00:00.000Z', end_time: '2026-09-10T11:00:00.000Z', status: 'completed' as const, paid: true, payment_status: 'paid' },
      { ...base, id: 'future', start_time: '2026-09-20T10:00:00.000Z', end_time: '2026-09-20T11:00:00.000Z', status: 'active' as const, paid: false },
      { ...base, id: 'cancelled', start_time: '2026-09-10T10:00:00.000Z', end_time: '2026-09-10T11:00:00.000Z', status: 'cancelled' as const, paid: false },
      { ...base, id: 'free', start_time: '2026-09-10T10:00:00.000Z', end_time: '2026-09-10T11:00:00.000Z', status: 'completed' as const, paid: false, is_complimentary: true },
    ];
    expect(countPastUnpaidSessions(rows, now)).toBe(1);
    expect(matchesOrgSessionStatChip(rows[0] as Session, 'unpaid_past', now)).toBe(true);
    expect(matchesOrgSessionStatChip(rows[1] as Session, 'unpaid_past', now)).toBe(false);
  });

  it('counts confirmed-only monthly lessons as unpaid after they end', () => {
    const row = {
      ...base,
      id: 'past-monthly',
      start_time: '2026-09-10T10:00:00.000Z',
      end_time: '2026-09-10T11:00:00.000Z',
      status: 'completed' as const,
      paid: false,
      payment_status: 'confirmed',
    };
    expect(countPastUnpaidSessions([row], now)).toBe(1);
  });

  it('clicking the same chip again clears the filter', () => {
    expect(toggleOrgSessionStatChip(null, 'unpaid_past')).toBe('unpaid_past');
    expect(toggleOrgSessionStatChip('unpaid_past', 'unpaid_past')).toBeNull();
    expect(toggleOrgSessionStatChip('unpaid_past', 'no_show')).toBe('no_show');
  });
});
