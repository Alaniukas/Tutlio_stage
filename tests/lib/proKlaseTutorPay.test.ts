import { describe, expect, it } from 'vitest';
import {
  PRO_KLASE_STUDENT_NO_SHOW_PAY_EUR,
  PRO_KLASE_TRIAL_PAY_EUR,
  proKlaseSessionPayEur,
  sumProKlasePayBreakdown,
} from '@/lib/proKlaseTutorPay';

describe('proKlaseSessionPayEur', () => {
  it('pays fixed 6 EUR for student no-show', () => {
    expect(
      proKlaseSessionPayEur({ status: 'no_show', price: 40 }, 25),
    ).toBe(PRO_KLASE_STUDENT_NO_SHOW_PAY_EUR);
  });

  it('pays fixed 10 EUR for completed trial lesson', () => {
    expect(
      proKlaseSessionPayEur(
        { status: 'completed', price: 40, subjects: { is_trial: true } },
        25,
      ),
    ).toBe(PRO_KLASE_TRIAL_PAY_EUR);
  });

  it('pays tutor rate for regular completed lesson', () => {
    expect(
      proKlaseSessionPayEur({ status: 'completed', price: 40 }, 25),
    ).toBe(25);
  });
});

describe('sumProKlasePayBreakdown', () => {
  it('sums earnings and applies adjustments', () => {
    const breakdown = sumProKlasePayBreakdown(
      [
        { status: 'completed', price: 30, subjects: { is_trial: false } },
        { status: 'no_show', price: 30 },
        { status: 'completed', price: 30, subjects: { is_trial: true } },
      ],
      20,
      -10,
    );
    expect(breakdown.individualLessons).toBe(1);
    expect(breakdown.individualEur).toBe(20);
    expect(breakdown.noShowLessons).toBe(1);
    expect(breakdown.trialLessons).toBe(1);
    expect(breakdown.totalEur).toBe(20 + 6 + 10 - 10);
  });
});
