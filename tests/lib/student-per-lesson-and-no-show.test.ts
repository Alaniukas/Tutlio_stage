import { describe, it, expect } from 'vitest';
import { resolvePerLessonPaymentRules } from '@/lib/studentPaymentModel';
import {
  defaultNoShowWhenForNow,
  noShowWhenLabelLt,
  buildNoShowSessionPatch,
  noShowTutorCommentLine,
} from '@/lib/noShowWhen';
import { calculateSessionStats, type Session } from '@/lib/session-stats';

const tutorDefaults = { payment_timing: 'before_lesson' as const, payment_deadline_hours: 24 };

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
