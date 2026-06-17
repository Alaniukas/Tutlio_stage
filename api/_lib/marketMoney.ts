import type { TutlioMarket } from './market.js';

export type ChargeCurrency = 'eur' | 'pln';

export const MARKET_FEES = {
  platformPercent: 0.02,
  stripePercent: 0.015,
  stripeFixed: { eur: 0.25, pln: 1.0 },
  schoolTutlioPercent: 0.01,
} as const;

/**
 * Per-organization custom fee deal. The fee is added on top of the lesson/base
 * price (the payer pays base + fee; the org receives the full base), tiered by
 * the base amount. Tiers are evaluated in order; the first tier whose `maxBase`
 * is >= the base amount applies (use Infinity for the final catch-all tier).
 */
export type OrgFeeProfile = {
  tiers: { maxBase: number; percent: number; fixed: number }[];
};

/**
 * Custom fee arrangements keyed by lowercased organization slug. Orgs not listed
 * here fall back to the standard market fee model. Keep this in sync with the
 * client mirror in `src/lib/marketMoney.ts`.
 */
export const ORG_FEE_PROFILES: Record<string, OrgFeeProfile> = {
  // Proklasė: <= €30 → 1.5% + €0.25; > €30 → 2% + €0.10.
  proklase: {
    tiers: [
      { maxBase: 30, percent: 0.015, fixed: 0.25 },
      { maxBase: Infinity, percent: 0.02, fixed: 0.1 },
    ],
  },
};

/**
 * Stable fallback keyed by organization UUID. Org slugs are admin-editable and
 * can be cleared, so the canonical org id guarantees the deal keeps applying.
 */
export const ORG_FEE_PROFILE_BY_ID: Record<string, OrgFeeProfile> = {
  '3422031d-6e21-424d-980b-35a9c6d7b8f1': ORG_FEE_PROFILES.proklase, // Pro Klasė
};

/** Resolve a custom fee deal by org slug or org UUID (either may be passed). */
export function orgFeeProfile(slugOrId?: string | null): OrgFeeProfile | null {
  if (!slugOrId) return null;
  const key = slugOrId.trim().toLowerCase();
  return ORG_FEE_PROFILES[key] ?? ORG_FEE_PROFILE_BY_ID[key] ?? null;
}

function orgProfileFee(baseAmount: number, profile: OrgFeeProfile): number {
  const tiers = profile.tiers;
  const tier = tiers.find((t) => baseAmount <= t.maxBase) ?? tiers[tiers.length - 1];
  return baseAmount * tier.percent + tier.fixed;
}

export function chargeCurrency(market: TutlioMarket): ChargeCurrency {
  return market === 'pl' ? 'pln' : 'eur';
}

export function stripeFixedFee(market: TutlioMarket): number {
  return market === 'pl' ? MARKET_FEES.stripeFixed.pln : MARKET_FEES.stripeFixed.eur;
}

export function customerTotal(
  baseAmount: number,
  market: TutlioMarket = 'default',
  feeProfile?: OrgFeeProfile | null,
): number {
  if (feeProfile) return baseAmount + orgProfileFee(baseAmount, feeProfile);
  const platformFee = baseAmount * MARKET_FEES.platformPercent;
  const fixed = stripeFixedFee(market);
  return (baseAmount + platformFee + fixed) / (1 - MARKET_FEES.stripePercent);
}

export function lessonCheckoutBreakdownCents(
  baseAmount: number,
  market: TutlioMarket = 'default',
  feeProfile?: OrgFeeProfile | null,
): { baseCents: number; feesCents: number; totalCents: number } {
  const total = customerTotal(baseAmount, market, feeProfile);
  const totalCents = Math.round(total * 100);
  const baseCents = Math.round(baseAmount * 100);
  return { baseCents, feesCents: totalCents - baseCents, totalCents };
}

export function schoolInstallmentCheckoutCents(
  amount: number,
  market: TutlioMarket = 'default',
): { chargeCents: number; transferToSchoolCents: number } {
  const tutlioFee = amount * MARKET_FEES.schoolTutlioPercent;
  const stripeEstimate = amount * MARKET_FEES.stripePercent + stripeFixedFee(market);
  const schoolNet = amount - tutlioFee - stripeEstimate;
  return {
    chargeCents: Math.round(amount * 100),
    transferToSchoolCents: Math.max(0, Math.round(schoolNet * 100)),
  };
}

export function checkoutBaseMetadata(
  baseAmount: number,
  market: TutlioMarket,
): Record<string, string> {
  const currency = chargeCurrency(market);
  return {
    tutlio_base_eur: baseAmount.toFixed(2),
    tutlio_base_amount: baseAmount.toFixed(2),
    tutlio_currency: currency,
  };
}

export function metadataBaseAmount(
  metadata: Record<string, string> | null | undefined,
): number | null {
  const raw = metadata?.tutlio_base_amount ?? metadata?.tutlio_base_eur;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function metadataCurrency(
  metadata: Record<string, string> | null | undefined,
): ChargeCurrency {
  const c = metadata?.tutlio_currency?.toLowerCase();
  return c === 'pln' ? 'pln' : 'eur';
}

export function creditNote(amount: number, market: TutlioMarket): string {
  const formatted =
    market === 'pl'
      ? `${amount.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\u00a0zł`
      : `€${amount.toFixed(2)}`;
  return market === 'pl' ? ` (kredyt -${formatted})` : ` (kreditas -${formatted})`;
}
