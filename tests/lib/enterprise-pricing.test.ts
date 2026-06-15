import { describe, expect, it } from 'vitest';
import { enterprisePlnTierDefs } from '@/lib/enterprisePricingPln';
import { enterpriseEurTierDefs } from '@/lib/enterprisePricingEur';
import {
  displayPricingForQuantity,
  formatMoney,
  tierForQuantity,
  totalCentsForQuantity,
  unitCentsForQuantity,
  type LicenseTier,
} from '@/lib/enterprisePricing';

// Nomora-style volume tiers: 1-10 -> €4.50, 11-50 -> €2.80, 51+ -> €2.20
const volumeTiers: LicenseTier[] = [
  { upTo: 10, unitAmountCents: 450, flatAmountCents: 0 },
  { upTo: 50, unitAmountCents: 280, flatAmountCents: 0 },
  { upTo: null, unitAmountCents: 220, flatAmountCents: 0 },
];

const volume = { tiers: volumeTiers, tiersMode: 'volume' as const };
const graduated = { tiers: volumeTiers, tiersMode: 'graduated' as const };

describe('tierForQuantity', () => {
  it('matches the first tier for small quantities', () => {
    expect(tierForQuantity(volumeTiers, 1)?.unitAmountCents).toBe(450);
    expect(tierForQuantity(volumeTiers, 10)?.unitAmountCents).toBe(450);
  });

  it('matches middle tier boundaries inclusively', () => {
    expect(tierForQuantity(volumeTiers, 11)?.unitAmountCents).toBe(280);
    expect(tierForQuantity(volumeTiers, 50)?.unitAmountCents).toBe(280);
  });

  it('falls into the infinite tier above all bounds', () => {
    expect(tierForQuantity(volumeTiers, 51)?.unitAmountCents).toBe(220);
    expect(tierForQuantity(volumeTiers, 5000)?.unitAmountCents).toBe(220);
  });

  it('returns null for empty tiers or non-positive quantity', () => {
    expect(tierForQuantity([], 5)).toBeNull();
    expect(tierForQuantity(volumeTiers, 0)).toBeNull();
  });
});

describe('totalCentsForQuantity — volume mode', () => {
  it('prices all units at the matched tier rate', () => {
    expect(totalCentsForQuantity(volume, 5)).toBe(5 * 450);
    expect(totalCentsForQuantity(volume, 25)).toBe(25 * 280);
    expect(totalCentsForQuantity(volume, 150)).toBe(150 * 220);
  });

  it('adds the tier flat amount once', () => {
    const withFlat = {
      tiersMode: 'volume' as const,
      tiers: [{ upTo: null, unitAmountCents: 100, flatAmountCents: 999 }],
    };
    expect(totalCentsForQuantity(withFlat, 10)).toBe(10 * 100 + 999);
  });

  it('returns 0 for invalid input', () => {
    expect(totalCentsForQuantity(volume, 0)).toBe(0);
    expect(totalCentsForQuantity({ tiers: [], tiersMode: 'volume' }, 5)).toBe(0);
  });
});

describe('totalCentsForQuantity — graduated mode', () => {
  it('prices each band progressively', () => {
    // 25 licenses: 10 x 450 + 15 x 280
    expect(totalCentsForQuantity(graduated, 25)).toBe(10 * 450 + 15 * 280);
    // 60 licenses: 10 x 450 + 40 x 280 + 10 x 220
    expect(totalCentsForQuantity(graduated, 60)).toBe(10 * 450 + 40 * 280 + 10 * 220);
  });

  it('stays within the first band for small quantities', () => {
    expect(totalCentsForQuantity(graduated, 7)).toBe(7 * 450);
  });

  it('adds flat amounts only for used bands', () => {
    const tiers = {
      tiersMode: 'graduated' as const,
      tiers: [
        { upTo: 10, unitAmountCents: 100, flatAmountCents: 50 },
        { upTo: null, unitAmountCents: 80, flatAmountCents: 30 },
      ],
    };
    expect(totalCentsForQuantity(tiers, 5)).toBe(5 * 100 + 50);
    expect(totalCentsForQuantity(tiers, 12)).toBe(10 * 100 + 50 + 2 * 80 + 30);
  });
});

describe('production tiers (volume: €49/mo admin fee + band rate for quantity)', () => {
  const production = {
    tiersMode: 'volume' as const,
    tiers: enterpriseEurTierDefs(),
  };

  it('charges the matched band rate for all licenses plus admin fee', () => {
    expect(totalCentsForQuantity(production, 1)).toBe(4900 + 1000); // €59
    expect(totalCentsForQuantity(production, 10)).toBe(4900 + 10_000); // €149
    expect(totalCentsForQuantity(production, 11)).toBe(4900 + 11 * 900); // €148
    expect(totalCentsForQuantity(production, 25)).toBe(4900 + 25 * 800); // €249
    expect(totalCentsForQuantity(production, 50)).toBe(4900 + 50 * 700); // €399
    expect(totalCentsForQuantity(production, 60)).toBe(4900 + 60 * 600); // €409
  });

  it('shows the band unit rate and admin fee separately', () => {
    expect(displayPricingForQuantity(production, 5)).toEqual({ unitCents: 1000, flatCents: 4900 });
    expect(displayPricingForQuantity(production, 50)).toEqual({ unitCents: 700, flatCents: 4900 });
    expect(displayPricingForQuantity(production, 0)).toEqual({ unitCents: 0, flatCents: 0 });
  });
});

describe('displayPricingForQuantity — volume mode', () => {
  it('shows the matched tier rate and its flat fee', () => {
    const withFlat = {
      tiersMode: 'volume' as const,
      tiers: [
        { upTo: 10, unitAmountCents: 1000, flatAmountCents: 4900 },
        { upTo: null, unitAmountCents: 900, flatAmountCents: 4900 },
      ],
    };
    expect(displayPricingForQuantity(withFlat, 5)).toEqual({ unitCents: 1000, flatCents: 4900 });
    expect(displayPricingForQuantity(withFlat, 15)).toEqual({ unitCents: 900, flatCents: 4900 });
  });

  it('averages graduated tiers without flats', () => {
    const { unitCents, flatCents } = displayPricingForQuantity(graduated, 25);
    expect(unitCents).toBeCloseTo((10 * 450 + 15 * 280) / 25);
    expect(flatCents).toBe(0);
  });
});

describe('unitCentsForQuantity', () => {
  it('is the tier rate under volume pricing without flat amounts', () => {
    expect(unitCentsForQuantity(volume, 25)).toBe(280);
  });

  it('averages bands under graduated pricing', () => {
    expect(unitCentsForQuantity(graduated, 25)).toBeCloseTo((10 * 450 + 15 * 280) / 25);
  });

  it('returns 0 for non-positive quantity', () => {
    expect(unitCentsForQuantity(volume, 0)).toBe(0);
  });
});

describe('production PLN tiers (volume — tutlio.pl)', () => {
  const productionPln = {
    tiersMode: 'volume' as const,
    tiers: enterprisePlnTierDefs().map((t) => ({
      upTo: t.upTo,
      unitAmountCents: t.unitAmountCents,
      flatAmountCents: t.flatAmountCents,
    })),
  };

  it('charges the matched band rate for all licenses plus admin fee in PLN', () => {
    expect(totalCentsForQuantity(productionPln, 1)).toBe(21_000 + 4_300); // 253 zł
    expect(totalCentsForQuantity(productionPln, 10)).toBe(21_000 + 43_000); // 640 zł
    expect(totalCentsForQuantity(productionPln, 11)).toBe(21_000 + 11 * 3_900); // 639 zł
    expect(totalCentsForQuantity(productionPln, 50)).toBe(21_000 + 50 * 3_000); // 1710 zł
  });
});
describe('formatMoney', () => {
  it('formats euro cents with decimals only when needed', () => {
    expect(formatMoney(280, 'eur')).toContain('2.80');
    expect(formatMoney(4500, 'eur')).toContain('45');
    expect(formatMoney(4500, 'eur')).not.toContain('45.00');
  });

  it('includes the currency symbol', () => {
    expect(formatMoney(100, 'eur')).toContain('€');
    expect(formatMoney(4300, 'pln', 'pl')).toContain('43');
  });
});
