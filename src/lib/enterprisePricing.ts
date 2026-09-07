/**
 * Enterprise license pricing math.
 * Mirrors Stripe tiered pricing so the pricing page shows exactly what
 * checkout charges. Tier data comes from GET /api/enterprise-license-pricing.
 */

import type { TutlioMarket } from './market';
import { ENTERPRISE_EUR, enterpriseEurTierDefs } from './enterprisePricingEur';
import { ENTERPRISE_PLN, enterprisePlnTierDefs } from './enterprisePricingPln';

export interface LicenseTier {
  /** Upper bound of the tier (inclusive), null = infinite last tier. */
  upTo: number | null;
  unitAmountCents: number;
  flatAmountCents: number;
}

export interface EnterpriseLicensePricing {
  currency: string;
  interval: 'month' | 'year';
  tiersMode: 'volume' | 'graduated';
  tiers: LicenseTier[];
  minLicenses: number;
  maxSelfServe: number;
}

/**
 * Canonical client fallback used when the public pricing endpoint is briefly
 * unavailable. Checkout still validates the final quantity and Stripe price.
 */
export function fallbackEnterpriseLicensePricing(market: TutlioMarket): EnterpriseLicensePricing {
  const isPl = market === 'pl';
  const config = isPl ? ENTERPRISE_PLN : ENTERPRISE_EUR;

  return {
    currency: isPl ? 'pln' : 'eur',
    interval: 'month',
    tiersMode: config.tiersMode,
    tiers: isPl ? enterprisePlnTierDefs() : enterpriseEurTierDefs(),
    minLicenses: 1,
    maxSelfServe: config.maxSelfServe,
  };
}

/** Tier a given quantity falls into (volume pricing semantics). */
export function tierForQuantity(tiers: LicenseTier[], quantity: number): LicenseTier | null {
  if (!tiers.length || quantity < 1) return null;
  for (const tier of tiers) {
    if (tier.upTo === null || quantity <= tier.upTo) return tier;
  }
  return tiers[tiers.length - 1];
}

/**
 * Total cents for a quantity.
 * - volume: all units priced at the matched tier's rate (+ its flat amount)
 * - graduated: each band priced progressively (+ flat per used band)
 */
export function totalCentsForQuantity(pricing: Pick<EnterpriseLicensePricing, 'tiers' | 'tiersMode'>, quantity: number): number {
  if (quantity < 1 || !pricing.tiers.length) return 0;

  if (pricing.tiersMode === 'graduated') {
    let total = 0;
    let prevUpTo = 0;
    for (const tier of pricing.tiers) {
      const bandEnd = tier.upTo === null ? quantity : Math.min(tier.upTo, quantity);
      const unitsInBand = Math.max(0, bandEnd - prevUpTo);
      if (unitsInBand > 0) {
        total += unitsInBand * tier.unitAmountCents + tier.flatAmountCents;
      }
      prevUpTo = tier.upTo === null ? quantity : tier.upTo;
      if (prevUpTo >= quantity) break;
    }
    return total;
  }

  const tier = tierForQuantity(pricing.tiers, quantity);
  if (!tier) return 0;
  return quantity * tier.unitAmountCents + tier.flatAmountCents;
}

/** Effective per-license cents for a quantity (total averaged over units). */
export function unitCentsForQuantity(pricing: Pick<EnterpriseLicensePricing, 'tiers' | 'tiersMode'>, quantity: number): number {
  if (quantity < 1) return 0;
  return totalCentsForQuantity(pricing, quantity) / quantity;
}

/**
 * What the UI should show for a quantity: per-license rate with the flat
 * (admin) fee called out separately.
 * - volume: the matched tier's unit rate + that tier's flat amount
 * - graduated: per-license rate averaged across bands, flat amounts of the
 *   used bands separated out (e.g. "€9.67/license + €49/mo admin fee")
 */
export function displayPricingForQuantity(
  pricing: Pick<EnterpriseLicensePricing, 'tiers' | 'tiersMode'>,
  quantity: number,
): { unitCents: number; flatCents: number } {
  if (quantity < 1 || !pricing.tiers.length) return { unitCents: 0, flatCents: 0 };

  if (pricing.tiersMode === 'volume') {
    const tier = tierForQuantity(pricing.tiers, quantity);
    return tier
      ? { unitCents: tier.unitAmountCents, flatCents: tier.flatAmountCents }
      : { unitCents: 0, flatCents: 0 };
  }

  let flatCents = 0;
  let prevUpTo = 0;
  for (const tier of pricing.tiers) {
    if (prevUpTo >= quantity) break;
    flatCents += tier.flatAmountCents;
    prevUpTo = tier.upTo === null ? quantity : tier.upTo;
  }
  const unitCents = (totalCentsForQuantity(pricing, quantity) - flatCents) / quantity;
  return { unitCents, flatCents };
}

export function formatMoney(cents: number, currency: string, locale?: string): string {
  const amount = cents / 100;
  const intlLocale =
    locale === 'pl' ? 'pl-PL'
      : locale === 'lt' ? 'lt-LT'
        : locale === 'en' ? 'en-GB'
          : locale;
  try {
    return new Intl.NumberFormat(intlLocale, {
      style: 'currency',
      currency: currency.toUpperCase(),
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return currency.toLowerCase() === 'pln' ? `${amount.toFixed(2)} zł` : `€${amount.toFixed(2)}`;
  }
}
