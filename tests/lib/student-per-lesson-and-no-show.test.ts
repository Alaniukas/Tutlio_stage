import { describe, it, expect } from 'vitest';
import {
  allowsPerLessonPaymentForStudent,
  defaultSessionPaymentStatusForStudent,
  resolvePerLessonPaymentRules,
  shouldRequestPerLessonCheckout,
  shouldShowPerLessonPaymentUi,
  studentPerLessonDebtBlocksBooking,
} from '@/lib/studentPaymentModel';
import {
  defaultNoShowWhenForNow,
  noShowWhenLabelLt,
  buildNoShowSessionPatch,
  noShowTutorCommentLine,
} from '@/lib/noShowWhen';
import { calculateSessionStats, type Session } from '@/lib/session-stats';

const tutorDefaults = { payment_timing: 'before_lesson' as const, payment_deadline_hours: 24 };

describe('studentPerLessonDebtBlocksBooking', () => {
  it('blocks when payment_model unset (default per-lesson debt)', () => {
    expect(studentPerLessonDebtBlocksBooking(null)).toBe(true);
    expect(studentPerLessonDebtBlocksBooking('')).toBe(true);
  });

  it('does not block for monthly_billing only', () => {
    expect(studentPerLessonDebtBlocksBooking('monthly_billing')).toBe(false);
  });

  it('blocks when per_lesson is selected (alone or with monthly)', () => {
    expect(studentPerLessonDebtBlocksBooking('per_lesson')).toBe(true);
    expect(studentPerLessonDebtBlocksBooking('monthly_billing,per_lesson')).toBe(true);
  });
});

describe('defaultSessionPaymentStatusForStudent', () => {
  it('uses confirmed for monthly-billing-only unpaid lessons', () => {
    expect(
      defaultSessionPaymentStatusForStudent('monthly_billing', { paid: false, hasPackage: false }),
    ).toBe('confirmed');
  });

  it('uses pending for per-lesson unpaid lessons', () => {
    expect(defaultSessionPaymentStatusForStudent('per_lesson', { paid: false, hasPackage: false })).toBe(
      'pending',
    );
  });
});

describe('shouldShowPerLessonPaymentUi / shouldRequestPerLessonCheckout', () => {
  it('honors monthly_billing on student even when payment_override_active is false', () => {
    expect(shouldShowPerLessonPaymentUi('monthly_billing', false)).toBe(false);
    expect(shouldRequestPerLessonCheckout('monthly_billing', false)).toBe(false);
  });

  it('shows per-lesson UI when per_lesson is selected', () => {
    expect(shouldShowPerLessonPaymentUi('per_lesson', true)).toBe(true);
    expect(shouldShowPerLessonPaymentUi('monthly_billing,per_lesson', true)).toBe(true);
  });

  it('uses tutor finance flags when override on and student model unset', () => {
    expect(
      shouldShowPerLessonPaymentUi(null, true, {
        enable_per_lesson: false,
        enable_monthly_billing: true,
      }),
    ).toBe(false);
  });
});

describe('allowsPerLessonPaymentForStudent', () => {
  it('uses tutor flags when student model unset', () => {
    expect(allowsPerLessonPaymentForStudent(null, true, false)).toBe(true);
    expect(allowsPerLessonPaymentForStudent(null, false, true)).toBe(false);
  });

  it('respects explicit monthly_billing on student', () => {
    expect(allowsPerLessonPaymentForStudent('monthly_billing', true, false)).toBe(false);
    expect(allowsPerLessonPaymentForStudent('per_lesson', false, true)).toBe(true);
  });
});

describe('resolvePerLessonPaymentRules (individual per-lesson override)', () => {
  it('returns tutor defaults when payment_model is not per_lesson', () => {
    expect(
      resolvePerLessonPaymentRules(
        {
          payment_model: 'monthly_billing',
          per_lesson_payment_timing: 'after_lesson',
          per_lesson_payment_deadline_hours: 48,
        },
        tutorDefaults,
      ),
    ).toEqual({ payment_timing: 'before_lesson', payment_deadline_hours: 24 });
  });

  it('inherits tutor timing and hours when per_lesson but overrides are null', () => {
    expect(
      resolvePerLessonPaymentRules(
        {
          payment_model: 'per_lesson',
          per_lesson_payment_timing: null,
          per_lesson_payment_deadline_hours: null,
        },
        { payment_timing: 'after_lesson', payment_deadline_hours: 12 },
      ),
    ).toEqual({ payment_timing: 'after_lesson', payment_deadline_hours: 12 });
  });

  it('overrides timing and deadline when per_lesson and fields are set', () => {
    expect(
      resolvePerLessonPaymentRules(
        {
          payment_model: 'per_lesson',
          per_lesson_payment_timing: 'after_lesson',
          per_lesson_payment_deadline_hours: 6,
        },
        tutorDefaults,
      ),
    ).toEqual({ payment_timing: 'after_lesson', payment_deadline_hours: 6 });
  });

  it('clamps invalid deadline to at least 1', () => {
    expect(
      resolvePerLessonPaymentRules(
        {
          payment_model: 'per_lesson',
          per_lesson_payment_timing: null,
          per_lesson_payment_deadline_hours: 0,
        },
        tutorDefaults,
      ).payment_deadline_hours,
    ).toBe(1);
  });

  it('falls back to before_lesson when tutor timing is invalid', () => {
    expect(
      resolvePerLessonPaymentRules(
        { payment_model: 'per_lesson', per_lesson_payment_timing: null, per_lesson_payment_deadline_hours: null },
        { payment_timing: 'weird', payment_deadline_hours: 24 },
      ).payment_timing,
    ).toBe('before_lesson');
  });
});

describe('no-show helpers', () => {
  const start = new Date('2026-06-01T10:00:00.000Z');
  const end = new Date('2026-06-01T11:00:00.000Z');

  it('defaultNoShowWhenForNow: before / during / after window', () => {
    expect(defaultNoShowWhenForNow(start, end, new Date('2026-06-01T09:30:00.000Z'))).toBe('before_lesson');
    expect(defaultNoShowWhenForNow(start, end, new Date('2026-06-01T10:30:00.000Z'))).toBe('during_lesson');
    expect(defaultNoShowWhenForNow(start, end, new Date('2026-06-01T11:30:00.000Z'))).toBe('after_lesson');
  });

  it('noShowWhenLabelLt returns Lithuanian labels', () => {
    expect(noShowWhenLabelLt('before_lesson')).toBe('Prieš pamoką');
    expect(noShowWhenLabelLt('during_lesson')).toBe('Pamokos metu');
    expect(noShowWhenLabelLt('after_lesson')).toBe('Po pamokos');
    expect(noShowWhenLabelLt(null)).toBe('');
  });

  it('buildNoShowSessionPatch sets status, when, and standard comment line', () => {
    const patch = buildNoShowSessionPatch('during_lesson', null);
    expect(patch.status).toBe('no_show');
    expect(patch.no_show_when).toBe('during_lesson');
    expect(patch.tutor_comment).toBe(noShowTutorCommentLine('during_lesson'));
    expect(patch.tutor_comment).toContain('pamokos metu');
  });

  it('buildNoShowSessionPatch appends after existing tutor_comment', () => {
    const patch = buildNoShowSessionPatch('before_lesson', 'Ankstesnis.');
    expect(patch.tutor_comment.startsWith('Ankstesnis.')).toBe(true);
    expect(patch.tutor_comment).toContain('\n');
    expect(patch.tutor_comment).toContain('prieš pamoką');
  });
});

describe('calculateSessionStats (no_show vs successful)', () => {
  const base = (overrides: Partial<Session>): Session => ({
    id: '1',
    tutor_id: 't',
    student_id: 's',
    start_time: '2020-01-01T10:00:00.000Z',
    end_time: '2020-01-01T11:00:00.000Z',
    status: 'completed',
    price: 10,
    ...overrides,
  });

  it('counts no_show separately and not as totalSuccessful', () => {
    const sessions: Session[] = [
      base({ id: 'a', status: 'completed' }),
      base({ id: 'b', status: 'no_show' }),
      base({
        id: 'c',
        status: 'active',
        end_time: '2020-01-01T11:00:00.000Z',
      }),
    ];
    const stats = calculateSessionStats(sessions, null, null);
    expect(stats.totalStudentNoShow).toBe(1);
    expect(stats.totalSuccessful).toBe(2);
  });

  it('no_show does not increment cancelled', () => {
    const stats = calculateSessionStats([base({ id: 'x', status: 'no_show' })], null, null);
    expect(stats.totalCancelled).toBe(0);
    expect(stats.totalStudentNoShow).toBe(1);
  });
});
