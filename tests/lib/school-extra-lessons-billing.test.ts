import { describe, expect, it } from 'vitest';
import { computeExtraLessonsMonthlyBill, sessionMatchesExtraLessonsContract } from '../../src/lib/schoolExtraLessonsBilling';

describe('schoolExtraLessonsBilling', () => {
  it('keeps group and individual extras isolated for a student with several agreements', () => {
    const session = { id: 'lesson', start_time: '2026-08-12T10:00:00Z', status: 'completed', subject_id: 'math', class_group_id: 'group-a' };
    expect(sessionMatchesExtraLessonsContract(session, { service_type: 'group', group_id: 'group-a' })).toBe(true);
    expect(sessionMatchesExtraLessonsContract(session, { service_type: 'group', group_id: 'group-b' })).toBe(false);
    expect(sessionMatchesExtraLessonsContract(session, { service_type: 'individual', subject_id: 'math' })).toBe(false);
    expect(sessionMatchesExtraLessonsContract({ ...session, class_group_id: null }, { service_type: 'individual', subject_id: 'math' })).toBe(true);
    expect(sessionMatchesExtraLessonsContract({ ...session, class_group_id: null }, { service_type: 'individual', subject_id: 'english' })).toBe(false);
    expect(sessionMatchesExtraLessonsContract({ ...session, class_group_id: null }, { service_type: 'individual' })).toBe(false);
  });

  it('uses each student contract allotment for a reduced group schedule', () => {
    const common = { unit_price_eur: 10, period_start: '2026-08-01', period_end: '2026-08-31', sessions: [] };
    expect(computeExtraLessonsMonthlyBill({ ...common, base_lessons_per_month: 12 }).total_eur).toBe(120);
    expect(computeExtraLessonsMonthlyBill({ ...common, base_lessons_per_month: 8 }).total_eur).toBe(80);
  });

  it('assigns midnight lessons by Vilnius month and excludes cancelled joined lessons', () => {
    const make = (id: string, start_time: string, cancelled = false) => ({ id, start_time, cancelled, status: 'completed', school_billing_kind: 'extra' as const });
    const bill = computeExtraLessonsMonthlyBill({
      unit_price_eur: 10, base_lessons_per_month: 8, period_start: '2026-08-01', period_end: '2026-08-31',
      sessions: [make('august', '2026-07-31T22:00:00Z'), make('september', '2026-08-31T22:00:00Z'), make('cancelled', '2026-08-05T10:00:00Z', true)],
    });
    expect(bill.extra_session_ids).toEqual(['august']);
  });

  it('stops base and extras after the agreement end, including without a start gate', () => {
    const common = { unit_price_eur: 10, base_lessons_per_month: 8, period_start: '2026-08-01', period_end: '2026-08-31', sessions: [{ id: 'late', start_time: '2026-08-12T10:00:00Z', status: 'completed', school_billing_kind: 'extra' as const }] };
    expect(computeExtraLessonsMonthlyBill({ ...common, serviceEndYmd: '2026-07-31' }).total_eur).toBe(0);
    expect(computeExtraLessonsMonthlyBill({ ...common, endedAtIso: '2026-07-31T10:00:00Z' }).total_eur).toBe(0);
    expect(computeExtraLessonsMonthlyBill({ ...common, endedAtIso: '2026-08-10T10:00:00Z' }).extra_lessons).toBe(0);
  });
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
