import { describe, expect, it } from 'vitest';
import { computeExtraLessonsMonthlyBill } from '../../src/lib/schoolExtraLessonsBilling';

describe('schoolExtraLessonsBilling', () => {
  it('bills base credits plus joined extras', () => {
    const bill = computeExtraLessonsMonthlyBill({
      unit_price_eur: 10,
      base_lessons_per_month: 8,
      period_start: '2026-08-01',
      period_end: '2026-08-31',
      sessions: [
        {
          id: 'base-1',
          start_time: '2026-08-05T10:00:00Z',
          status: 'completed',
          school_billing_kind: 'base',
          student_joined_at: null,
        },
        {
          id: 'extra-1',
          start_time: '2026-08-12T10:00:00Z',
          status: 'completed',
          school_billing_kind: 'extra',
          student_joined_at: '2026-08-12T10:01:00Z',
        },
        {
          id: 'extra-miss',
          start_time: '2026-08-19T10:00:00Z',
          status: 'no_show',
          school_billing_kind: 'extra',
          student_joined_at: null,
        },
      ],
    });
    expect(bill.base_amount_eur).toBe(80);
    expect(bill.extra_lessons).toBe(1);
    expect(bill.extra_amount_eur).toBe(10);
    expect(bill.total_eur).toBe(90);
    expect(bill.extra_session_ids).toEqual(['extra-1']);
  });

  it('skips extras before allowed start and after withdrawal', () => {
    const bill = computeExtraLessonsMonthlyBill({
      unit_price_eur: 10,
      base_lessons_per_month: 8,
      period_start: '2026-08-01',
      period_end: '2026-08-31',
      serviceStartYmd: '2026-08-15',
      endedAtIso: '2026-08-20T12:00:00.000Z',
      sessions: [
        {
          id: 'too-early',
          start_time: '2026-08-12T10:00:00Z',
          status: 'completed',
          school_billing_kind: 'extra',
          student_joined_at: '2026-08-12T10:01:00Z',
        },
        {
          id: 'ok',
          start_time: '2026-08-16T10:00:00Z',
          status: 'completed',
          school_billing_kind: 'extra',
          student_joined_at: '2026-08-16T10:01:00Z',
        },
        {
          id: 'after-end',
          start_time: '2026-08-21T10:00:00Z',
          status: 'completed',
          school_billing_kind: 'extra',
          student_joined_at: '2026-08-21T10:01:00Z',
        },
      ],
    });
    expect(bill.extra_session_ids).toEqual(['ok']);
  });

  it('charges no base credits when the whole month is before allowed start', () => {
    const bill = computeExtraLessonsMonthlyBill({
      unit_price_eur: 18,
      base_lessons_per_month: 8,
      period_start: '2026-08-01',
      period_end: '2026-08-31',
      serviceStartYmd: '2026-09-10',
      sessions: [{
        id: 'joined-too-early',
        start_time: '2026-08-20T10:00:00Z',
        status: 'completed',
        school_billing_kind: 'extra',
        student_joined_at: '2026-08-20T10:01:00Z',
      }],
    });
    expect(bill.base_lessons).toBe(0);
    expect(bill.extra_lessons).toBe(0);
    expect(bill.total_eur).toBe(0);
  });
});
