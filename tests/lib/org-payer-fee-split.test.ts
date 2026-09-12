import { describe, expect, it } from 'vitest';
import { customerTotal } from '../../src/lib/marketMoney';
import {
  orgNetFromPayerFeeSplit,
  parseOrgPayerFeeSplitConfig,
  resolveOrgPayerFeeSplit,
  ORG_PAYER_FEE_SPLIT_FEATURE,
} from '../../src/lib/orgPayerFeeSplit';

describe('org payer fee split', () => {
  it('returns null when feature flag is off', () => {
    expect(resolveOrgPayerFeeSplit({ payer_fee_split: { platform_share: 0 } })).toBeNull();
  });

  it('parses stored config when feature flag is on', () => {
    const split = resolveOrgPayerFeeSplit({
      [ORG_PAYER_FEE_SPLIT_FEATURE]: true,
      payer_fee_split: { platform_share: 50, stripe_percent_share: 100, stripe_fixed_share: 0 },
    });
    expect(split).toEqual({
      platformShare: 50,
      stripePercentShare: 100,
      stripeFixedShare: 0,
    });
  });

  it('reduces payer total when org absorbs part of fees', () => {
    const full = customerTotal(20, 'default', null, null);
    const split = parseOrgPayerFeeSplitConfig({ platform_share: 0, stripe_percent_share: 100, stripe_fixed_share: 0 });
    const reduced = customerTotal(20, 'default', null, split);
    expect(reduced).toBeLessThan(full);
    expect(reduced).toBeCloseTo(20 / 0.985, 2);
  });

  it('reduces company net when it absorbs fees', () => {
    const split = parseOrgPayerFeeSplitConfig({ platform_share: 50, stripe_percent_share: 100, stripe_fixed_share: 100 });
    expect(orgNetFromPayerFeeSplit(20, 'default', split)).toBeLessThan(20);
    expect(orgNetFromPayerFeeSplit(20, 'default', split)).toBeCloseTo(19.7, 0);
    expect(orgNetFromPayerFeeSplit(20, 'default', parseOrgPayerFeeSplitConfig({ platform_share: 100, stripe_percent_share: 100, stripe_fixed_share: 100 }))).toBe(20);
  });
});
