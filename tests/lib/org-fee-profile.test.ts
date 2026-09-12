import { describe, expect, it } from 'vitest';
import {
  orgFeeProfile,
  customerTotal,
  orgBaseFromPayerChargedTotal,
  lessonCheckoutBreakdownCents,
  formatLessonStripeCharge,
  lessonStripeBreakdown,
} from '../../src/lib/marketMoney';
import {
  orgFeeProfile as serverOrgFeeProfile,
  lessonCheckoutBreakdownCents as serverBreakdown,
} from '../../api/_lib/marketMoney';

// Pro Klasė payer fees: <= €30 → Stripe only (1.5% + €0.25 gross-up); > €30 → 2% + €0.10 on top.

describe('orgFeeProfile resolver', () => {
  it('resolves the Proklasė profile and normalizes the slug', () => {
    expect(orgFeeProfile('proklase')).not.toBeNull();
    expect(orgFeeProfile('  Proklase ')).not.toBeNull();
    expect(orgFeeProfile('PROKLASE')).not.toBeNull();
  });

  it('returns null for unknown / empty slugs', () => {
    expect(orgFeeProfile('some-other-org')).toBeNull();
    expect(orgFeeProfile(null)).toBeNull();
    expect(orgFeeProfile(undefined)).toBeNull();
    expect(orgFeeProfile('')).toBeNull();
  });

  it('stays in sync with the server mirror', () => {
    expect(serverOrgFeeProfile('proklase')).not.toBeNull();
  });
});

describe('Proklasė payer fee — customerTotal', () => {
  const p = orgFeeProfile('proklase');

  it('adds only Stripe processing for lessons up to €30', () => {
    expect(customerTotal(20, 'default', p)).toBeCloseTo((20 + 0.25) / 0.985, 6);
    expect(customerTotal(30, 'default', p)).toBeCloseTo((30 + 0.25) / 0.985, 6);
  });

  it('adds only 2% + €0.10 for lessons above €30', () => {
    expect(customerTotal(50, 'default', p)).toBeCloseTo(51.1, 6);
    expect(customerTotal(100, 'default', p)).toBeCloseTo(102.1, 6);
  });

  it('uses the standard market gross-up when no profile is given', () => {
    expect(customerTotal(20, 'default')).toBeCloseTo((20 + 0.4 + 0.25) / 0.985, 6);
    expect(customerTotal(20, 'default', null)).toBeCloseTo((20 + 0.4 + 0.25) / 0.985, 6);
  });

  it('recovers the lesson base from the payer total', () => {
    expect(orgBaseFromPayerChargedTotal(customerTotal(20, 'default', p)!, p)).toBe(20);
    expect(orgBaseFromPayerChargedTotal(customerTotal(50, 'default', p)!, p)).toBe(50);
    expect(orgBaseFromPayerChargedTotal(customerTotal(20, 'default', null)!, null)).toBe(20);
  });
});

describe('Proklasė payer fee — checkout breakdown (cents)', () => {
  const p = orgFeeProfile('proklase');

  it('splits base and fee correctly for the low tier', () => {
    const total = customerTotal(20, 'default', p);
    expect(lessonCheckoutBreakdownCents(20, 'default', p)).toEqual({
      baseCents: 2000,
      feesCents: Math.round(total * 100) - 2000,
      totalCents: Math.round(total * 100),
    });
  });

  it('splits base and fee correctly for the high tier', () => {
    expect(lessonCheckoutBreakdownCents(50, 'default', p)).toEqual({
      baseCents: 5000,
      feesCents: 110,
      totalCents: 5110,
    });
  });

  it('matches the server mirror exactly', () => {
    const sp = serverOrgFeeProfile('proklase');
    expect(serverBreakdown(50, 'default', sp)).toEqual(lessonCheckoutBreakdownCents(50, 'default', p));
  });
});

describe('Proklasė payer fee — display helpers', () => {
  const p = orgFeeProfile('proklase');

  it('charges the fee on top even for school-type orgs when a profile is set', () => {
    expect(formatLessonStripeCharge(20, true, 'default', null)).toBe('€20.00');
    expect(formatLessonStripeCharge(20, true, 'default', p)).toBe(`€${customerTotal(20, 'default', p).toFixed(2)}`);
  });

  it('reports the tiered breakdown', () => {
    expect(lessonStripeBreakdown(50, 'default', p)).toEqual({ base: 50, fee: 1.1, total: 51.1 });
  });
});
