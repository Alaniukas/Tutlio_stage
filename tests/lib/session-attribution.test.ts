import { describe, expect, it } from 'vitest';
import { countStudentSessionStats, rescheduleAttribution } from '../../src/lib/session-stats';

describe('rescheduleAttribution', () => {
  it('is null when the session was never rescheduled', () => {
    expect(rescheduleAttribution({ rescheduled_at: null })).toBeNull();
    expect(rescheduleAttribution({})).toBeNull();
  });

  it('prefers the explicit reschedule_requested_by column', () => {
    expect(
      rescheduleAttribution({ rescheduled_at: '2026-07-01T10:00:00Z', reschedule_requested_by: 'student', reschedule_reason: 'liga' }),
    ).toBe('student');
    expect(
      rescheduleAttribution({ rescheduled_at: '2026-07-01T10:00:00Z', reschedule_requested_by: 'tutor', reschedule_reason: null }),
    ).toBe('tutor');
  });

  it('legacy fallback: reason set only by tutor/admin moves → tutor; no reason → student self-service', () => {
    expect(
      rescheduleAttribution({ rescheduled_at: '2026-07-01T10:00:00Z', reschedule_reason: 'Korepetitorius sirgo' }),
    ).toBe('tutor');
    expect(rescheduleAttribution({ rescheduled_at: '2026-07-01T10:00:00Z', reschedule_reason: '   ' })).toBe('student');
    expect(rescheduleAttribution({ rescheduled_at: '2026-07-01T10:00:00Z' })).toBe('student');
  });
});

describe('countStudentSessionStats', () => {
  it('splits cancels by cancelled_by and moves by attribution', () => {
    const counters = countStudentSessionStats([
      { status: 'cancelled', cancelled_by: 'student' },
      { status: 'cancelled', cancelled_by: 'tutor' },
      { status: 'cancelled', cancelled_by: null },
      { status: 'active', rescheduled_at: '2026-07-01T10:00:00Z', reschedule_requested_by: 'student' },
      { status: 'active', rescheduled_at: '2026-07-01T10:00:00Z', reschedule_reason: 'moved by admin' },
      { status: 'completed' },
    ]);
    expect(counters).toEqual({
      cancelledByStudent: 1,
      cancelledByTutor: 1,
      movedByStudent: 1,
      movedByTutor: 1,
    });
  });

  it('a cancelled session that was also moved counts in both metrics', () => {
    const counters = countStudentSessionStats([
      { status: 'cancelled', cancelled_by: 'tutor', rescheduled_at: '2026-07-01T10:00:00Z', reschedule_requested_by: 'student' },
    ]);
    expect(counters).toEqual({
      cancelledByStudent: 0,
      cancelledByTutor: 1,
      movedByStudent: 1,
      movedByTutor: 0,
    });
  });
});
