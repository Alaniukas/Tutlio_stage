import { describe, expect, it } from 'vitest';
import { discountExtraLessonsBill, type ExtraLessonsDiscountAgreement } from '../../src/lib/schoolExtraLessonsDiscount';

const agreement: ExtraLessonsDiscountAgreement = {
  id: 'addendum-1', agreement_number: 'NPR-1', subject_id: 'math', tutor_id: 'teacher-1',
  discount_type: 'percent', discount_value: 25, valid_from: '2026-09-01',
  valid_until: '2026-09-30', accepted_at: '2026-09-15T10:00:00Z', note: null,
};
const lesson = (id: string, start_time: string, subject_id = 'math', tutor_id = 'teacher-1') =>
  ({ id, start_time, subject_id, tutor_id });

describe('extra-lessons contract discounts', () => {
  it('discounts only billable lessons after parent acceptance, including teacher changes within the contract', () => {
    const sessions = [
      lesson('before', '2026-09-10T10:00:00Z'),
      lesson('after', '2026-09-16T10:00:00Z'),
      lesson('other-teacher', '2026-09-17T10:00:00Z', 'math', 'teacher-2'),
      lesson('other-subject', '2026-09-18T10:00:00Z', 'russian'),
      lesson('not-billed', '2026-09-19T10:00:00Z'),
    ];
    expect(discountExtraLessonsBill(40, 10, sessions.slice(0, 4).map((s) => s.id), sessions, [agreement]))
      .toEqual({ subtotalEur: 40, discountAmountEur: 7.5, totalEur: 32.5, discountNote: 'NPR-1' });
  });

  it('applies a fixed euro discount once per month and caps it at eligible charges', () => {
    const sessions = [lesson('a', '2026-09-16T10:00:00Z'), lesson('b', '2026-09-23T10:00:00Z')];
    expect(discountExtraLessonsBill(20, 10, ['a', 'b'], sessions,
      [{ ...agreement, discount_type: 'amount', discount_value: 12, note: 'Socialinė nuolaida' }]))
      .toEqual({ subtotalEur: 20, discountAmountEur: 12, totalEur: 8, discountNote: 'NPR-1: Socialinė nuolaida' });
    expect(discountExtraLessonsBill(10, 10, ['a'], sessions,
      [{ ...agreement, discount_type: 'amount', discount_value: 99 }]).totalEur).toBe(0);
  });

  it('does not stack overlapping addenda on a lesson', () => {
    const sessions = [lesson('a', '2026-09-20T10:00:00Z')];
    expect(discountExtraLessonsBill(10, 10, ['a'], sessions, [agreement,
      { ...agreement, id: 'addendum-2', agreement_number: 'NPR-2', accepted_at: '2026-09-19T10:00:00Z', discount_value: 50 },
    ])).toEqual({ subtotalEur: 10, discountAmountEur: 5, totalEur: 5, discountNote: 'NPR-2' });
  });
});
