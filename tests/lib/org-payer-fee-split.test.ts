import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { customerTotal, paymentCheckoutBreakdownCents } from '../../src/lib/marketMoney';
import { paymentCheckoutBreakdownCents as serverPaymentBreakdown } from '../../api/_lib/marketMoney';
import { directChargeApplicationFeeCents } from '../../api/_lib/marketMoney';
import { en } from '../../src/lib/i18n/en';
import { lt } from '../../src/lib/i18n/lt';
import { nl } from '../../src/lib/i18n/nl';
import { pl } from '../../src/lib/i18n/pl';
import { fr } from '../../src/lib/i18n/fr';
import {
  orgNetFromPayerFeeSplit,
  parseOrgPayerFeeSplitConfig,
  resolveOrgPayerFeeSplit,
  ORG_PAYER_FEE_SPLIT_FEATURE,
} from '../../src/lib/orgPayerFeeSplit';

describe('org payer fee split', () => {
  it('has English, Lithuanian, and Dutch copy for every translation used by the settings UI', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/company/OrgPayerFeeSplitSettings.tsx'),
      'utf8',
    );
    const keys = [...source.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);

    expect(keys).toContain('companyFinance.payerFeeSplitTitle');
    for (const [locale, dictionary] of Object.entries({ en, lt, nl, pl, fr })) {
      const missing = keys.filter((key) => !(key in dictionary));
      expect(missing, `${locale} is missing settings translations:\n${missing.join('\n')}`).toEqual([]);
    }
  });

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

  it('keeps Tutlio application fee at 2% while the payer share is configurable', () => {
    const split = parseOrgPayerFeeSplitConfig({
      platform_share: 25,
      stripe_percent_share: 50,
      stripe_fixed_share: 0,
    });

    expect(directChargeApplicationFeeCents(100, 'default', null, split)).toBe(200);
  });

  it('applies Stripe 1.5% + 0.25 EUR once per payment, not per lesson', () => {
    const mk = parseOrgPayerFeeSplitConfig({
      platform_share: 0,
      stripe_percent_share: 65,
      stripe_fixed_share: 100,
    });
    const oneLesson = paymentCheckoutBreakdownCents(15, 'default', null, mk);
    const tenLessonsWrong = Array.from({ length: 10 }, () => paymentCheckoutBreakdownCents(30, 'default', null, mk))
      .reduce((sum, row) => sum + row.totalCents, 0);
    const tenLessonsPayment = paymentCheckoutBreakdownCents(300, 'default', null, mk);

    expect(oneLesson.totalCents).toBe(1540);
    expect(tenLessonsPayment.totalCents).toBe(30321);
    expect(tenLessonsWrong).toBe(30550);
    expect(tenLessonsPayment.totalCents).toBeLessThan(tenLessonsWrong);
    expect(serverPaymentBreakdown(300, 'default', null, mk)).toEqual(tenLessonsPayment);
  });

  it('applies the same once-per-payment Stripe fixed fee for Mokslo vaisiai shares', () => {
    const mv = parseOrgPayerFeeSplitConfig({
      platform_share: 50,
      stripe_percent_share: 50,
      stripe_fixed_share: 100,
    });
    const once = paymentCheckoutBreakdownCents(200, 'default', null, mv);
    const twice = paymentCheckoutBreakdownCents(100, 'default', null, mv).totalCents
      + paymentCheckoutBreakdownCents(100, 'default', null, mv).totalCents;
    expect(once.totalCents).toBeLessThan(twice);
    expect(directChargeApplicationFeeCents(200, 'default', null, mv)).toBe(400);
  });
});
