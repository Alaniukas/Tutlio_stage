import { describe, expect, it } from 'vitest';
import {
  PRO_KLASE_STUDENT_NO_SHOW_PAY_EUR,
  PRO_KLASE_TRIAL_PAY_EUR,
  countProKlaseRealizedSessions,
  proKlaseSessionPayEur,
  sumProKlasePayBreakdown,
  sumProKlaseRealizedPayEur,
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

  it('returns 0 for completed lesson when tutor rate is 0 (never session.price)', () => {
    expect(
      proKlaseSessionPayEur({ status: 'completed', price: 33 }, 0),
    ).toBe(0);
  });

  it('unwraps array-shaped subjects from PostgREST embeds', () => {
    expect(
      proKlaseSessionPayEur(
        {
          status: 'completed',
          price: 27,
          subjects: [{ is_trial: false }],
        },
        15,
      ),
    ).toBe(15);
  });

  it('returns 0 for unpaid future sessions', () => {
    expect(proKlaseSessionPayEur({ status: 'active', price: 10, subjects: { is_trial: true } }, 15)).toBe(0);
  });

  it('Rimantas shape: 1 completed regular + 1 future paid trial → 1 lesson, 15 EUR pay', () => {
    const sessions = [
      { status: 'completed', price: 27, subjects: { is_trial: false } },
      { status: 'active', price: 10, paid: true, subjects: { is_trial: true } },
    ];
    expect(countProKlaseRealizedSessions(sessions)).toBe(1);
    expect(sumProKlaseRealizedPayEur(sessions, 15)).toBe(15);
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
