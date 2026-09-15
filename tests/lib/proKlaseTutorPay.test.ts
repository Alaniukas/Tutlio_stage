import { describe, expect, it } from 'vitest';
import {
  PRO_KLASE_STUDENT_NO_SHOW_PAY_EUR,
  PRO_KLASE_TRIAL_PAY_EUR,
  countProKlaseConfirmedCompleted,
  countProKlaseConfirmedNoShows,
  countProKlaseRealizedSessions,
  isProKlaseAwaitingOutcomeConfirmation,
  proKlaseSessionPayEur,
  sumProKlasePayBreakdown,
  sumProKlaseRealizedPayEur,
} from '@/lib/proKlaseTutorPay';

const confirmedAt = '2026-09-10T18:00:00.000Z';

describe('proKlaseSessionPayEur', () => {
  it('pays fixed 6 EUR for a confirmed student no-show', () => {
    expect(
      proKlaseSessionPayEur({ status: 'no_show', price: 40, status_confirmed_at: confirmedAt }, 25),
    ).toBe(PRO_KLASE_STUDENT_NO_SHOW_PAY_EUR);
  });

  it('pays fixed 10 EUR for a confirmed completed trial lesson', () => {
    expect(
      proKlaseSessionPayEur(
        { status: 'completed', price: 40, subjects: { is_trial: true }, status_confirmed_at: confirmedAt },
        25,
      ),
    ).toBe(PRO_KLASE_TRIAL_PAY_EUR);
  });

  it('pays tutor rate for a confirmed regular completed lesson', () => {
    expect(
      proKlaseSessionPayEur({ status: 'completed', price: 40, status_confirmed_at: confirmedAt }, 25),
    ).toBe(25);
  });

  it('returns 0 for completed lesson when tutor rate is 0 (never session.price)', () => {
    expect(
      proKlaseSessionPayEur({ status: 'completed', price: 33, status_confirmed_at: confirmedAt }, 0),
    ).toBe(0);
  });

  it('unwraps array-shaped subjects from PostgREST embeds', () => {
    expect(
      proKlaseSessionPayEur(
        {
          status: 'completed',
          price: 27,
          subjects: [{ is_trial: false }],
          status_confirmed_at: confirmedAt,
        },
        15,
      ),
    ).toBe(15);
  });

  it('returns 0 for unpaid future sessions', () => {
    expect(proKlaseSessionPayEur({ status: 'active', price: 10, subjects: { is_trial: true } }, 15)).toBe(0);
  });

  it('returns 0 until the tutor marks attended or no-show', () => {
    expect(proKlaseSessionPayEur({ status: 'completed', price: 40 }, 25)).toBe(0);
    expect(proKlaseSessionPayEur({ status: 'no_show', price: 40 }, 25)).toBe(0);
    expect(proKlaseSessionPayEur({ status: 'completed', price: 40, status_confirmed_at: null }, 25)).toBe(0);
  });

  it('Rimantas shape: 1 confirmed completed regular + 1 future paid trial → 1 lesson, 15 EUR pay', () => {
    const sessions = [
      { status: 'completed', price: 27, subjects: { is_trial: false }, status_confirmed_at: confirmedAt },
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
        { status: 'completed', price: 30, subjects: { is_trial: false }, status_confirmed_at: confirmedAt },
        { status: 'no_show', price: 30, status_confirmed_at: confirmedAt },
        { status: 'completed', price: 30, subjects: { is_trial: true }, status_confirmed_at: confirmedAt },
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

describe('Pro Klasė outcome confirmation', () => {
  it('counts confirmed completed and no-show lessons separately', () => {
    const sessions = [
      { status: 'completed', status_confirmed_at: confirmedAt },
      { status: 'completed', status_confirmed_at: null },
      { status: 'no_show', status_confirmed_at: confirmedAt },
      { status: 'no_show' },
      { status: 'active' },
    ];
    expect(countProKlaseConfirmedCompleted(sessions)).toBe(1);
    expect(countProKlaseConfirmedNoShows(sessions)).toBe(1);
    expect(countProKlaseRealizedSessions(sessions)).toBe(2);
  });

  it('queues ended unmarked lessons, including leftover completed rows', () => {
    const now = new Date('2026-09-15T12:00:00.000Z');
    expect(isProKlaseAwaitingOutcomeConfirmation({
      status: 'active',
      end_time: '2026-09-15T10:00:00.000Z',
      status_confirmed_at: null,
    }, now)).toBe(true);
    expect(isProKlaseAwaitingOutcomeConfirmation({
      status: 'completed',
      end_time: '2026-09-15T10:00:00.000Z',
    }, now)).toBe(true);
    expect(isProKlaseAwaitingOutcomeConfirmation({
      status: 'completed',
      end_time: '2026-09-15T10:00:00.000Z',
      status_confirmed_at: confirmedAt,
    }, now)).toBe(false);
    expect(isProKlaseAwaitingOutcomeConfirmation({
      status: 'active',
      end_time: '2026-09-15T18:00:00.000Z',
    }, now)).toBe(false);
  });
});
