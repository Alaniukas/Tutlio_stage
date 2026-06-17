import { describe, expect, it } from 'vitest';
import {
  orgFeeProfile,
  customerTotal,
  lessonCheckoutBreakdownCents,
  formatLessonStripeCharge,
  lessonStripeBreakdown,
} from '../../src/lib/marketMoney';
import {
  orgFeeProfile as serverOrgFeeProfile,
  lessonCheckoutBreakdownCents as serverBreakdown,
} from '../../api/_lib/marketMoney';

// Proklasė deal: payment <= €30 → 1.5% + €0.25; payment > €30 → 2% + €0.10.
// The fee is added on top of the lesson price (the payer pays base + fee).

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

describe('Proklasė tiered fee — customerTotal', () => {
  const p = orgFeeProfile('proklase');

  it('charges 1.5% + €0.25 on top up to €30 (inclusive)', () => {
    expect(customerTotal(20, 'default', p)).toBeCloseTo(20.55, 5); // 20 + (0.30 + 0.25)
    expect(customerTotal(30, 'default', p)).toBeCloseTo(30.70, 5); // 30 + (0.45 + 0.25)
  });

  it('charges 2% + €0.10 on top above €30', () => {
    expect(customerTotal(50, 'default', p)).toBeCloseTo(51.10, 5); // 50 + (1.00 + 0.10)
    expect(customerTotal(100, 'default', p)).toBeCloseTo(102.10, 5); // 100 + (2.00 + 0.10)
  });

  it('leaves the standard market model untouched when no profile is given', () => {
    // (base + 2% + €0.25) / (1 - 1.5%)
    expect(customerTotal(20, 'default')).toBeCloseTo((20 + 0.4 + 0.25) / 0.985, 6);
    expect(customerTotal(20, 'default', null)).toBeCloseTo((20 + 0.4 + 0.25) / 0.985, 6);
  });
});

describe('Proklasė tiered fee — checkout breakdown (cents)', () => {
  const p = orgFeeProfile('proklase');

  it('splits base and fee correctly for the low tier', () => {
    expect(lessonCheckoutBreakdownCents(20, 'default', p)).toEqual({
      baseCents: 2000,
      feesCents: 55,
      totalCents: 2055,
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

describe('Proklasė tiered fee — display helpers', () => {
  const p = orgFeeProfile('proklase');

  it('charges the fee on top even for school-type orgs when a profile is set', () => {
    // School org normally absorbs fees (payer pays list price)...
    expect(formatLessonStripeCharge(20, true, 'default', null)).toBe('€20.00');
    // ...but a custom profile is charged on top regardless.
    expect(formatLessonStripeCharge(20, true, 'default', p)).toBe('€20.55');
  });

  it('reports the tiered breakdown', () => {
    expect(lessonStripeBreakdown(50, 'default', p)).toEqual({ base: 50, fee: 1.1, total: 51.1 });
  });
});
