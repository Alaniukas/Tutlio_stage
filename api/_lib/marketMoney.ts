import type { TutlioMarket } from './market.js';
import type { OrgPayerFeeSplit } from '../../src/lib/orgPayerFeeSplit.js';
import { payerFeeSplitShare01 } from '../../src/lib/orgPayerFeeSplit.js';

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
  // Pro Klasė payer fees: <= €30 → Stripe only (1.5% + €0.25 gross-up); > €30 → 2% + €0.10 on top.
  proklase: {
    tiers: [
      { maxBase: 30, percent: 0.015, fixed: 0.25 },
      { maxBase: Infinity, percent: 0.02, fixed: 0.1 },
    ],
  },
};

const PRO_KLASE_LOW_TIER_MAX_BASE = 30;
const PRO_KLASE_HIGH_TIER_PERCENT = 0.02;
const PRO_KLASE_HIGH_TIER_FIXED_EUR = 0.1;

export function isProKlaseFeeProfile(profile: OrgFeeProfile | null | undefined): boolean {
  if (!profile) return false;
  return profile === ORG_FEE_PROFILES.proklase
    || Object.values(ORG_FEE_PROFILE_BY_ID).includes(profile);
}

function proKlaseCustomerTotal(baseAmount: number, market: TutlioMarket): number {
  const fixed = stripeFixedFee(market);
  if (baseAmount <= PRO_KLASE_LOW_TIER_MAX_BASE) {
    return (baseAmount + fixed) / (1 - MARKET_FEES.stripePercent);
  }
  return baseAmount + baseAmount * PRO_KLASE_HIGH_TIER_PERCENT + PRO_KLASE_HIGH_TIER_FIXED_EUR;
}

/**
 * Stable fallback keyed by organization UUID. Org slugs are admin-editable and
 * can be cleared, so the canonical org id guarantees the deal keeps applying.
 */
export const ORG_FEE_PROFILE_BY_ID: Record<string, OrgFeeProfile> = {
  '3422031d-6e21-424d-980b-35a9c6d7b8f1': ORG_FEE_PROFILES.proklase, // Pro Klasė
  'b0a00000-7e57-4000-8000-000000000001': ORG_FEE_PROFILES.proklase, // Pro Klasė QA
};

/** Canonical Pro Klasė org UUID (slug is admin-editable). */
export const PRO_KLASE_ORG_ID = '3422031d-6e21-424d-980b-35a9c6d7b8f1';

/** QA clone org — same Pro Klasė tutor cancel rules for testing. */
export const PRO_KLASE_QA_ORG_ID = 'b0a00000-7e57-4000-8000-000000000001';

/** Production MB Mano korepetitorius (slug `mb-mano-korepetitorius`). */
export const MANO_KOREPETITORIUS_ORG_ID = '2c4e4c2a-4e12-44ca-b327-d605bbb0d50b';
export const MANO_KOREPETITORIUS_SLUG = 'mb-mano-korepetitorius';

/** Production IĮ Mokslo vaisiai (slug `mokslovaisiai`). */
export const MOKSLO_VAISIAI_ORG_ID = 'c1f36796-c281-4650-bed2-1bd6874764f1';
export const MOKSLO_VAISIAI_SLUG = 'mokslovaisiai';
/** QA clone — finance totals access demo (slug `demo-mokslo-vaisiai`). */
export const MOKSLO_VAISIAI_DEMO_ORG_ID = 'c1b00000-7e57-4000-8000-000000000001';
export const MOKSLO_VAISIAI_DEMO_SLUG = 'demo-mokslo-vaisiai';
export const MOKSLO_VAISIAI_ADMIN_EMAIL = 'info@mokslovaisiai.lt';
export const MOKSLO_VAISIAI_BRAND_COLOR = '#124410';
export const MOKSLO_VAISIAI_BRAND_COLOR_SECONDARY = '#5C2B02';

export function isManoKorepetitoriusOrg(orgIdOrSlug?: string | null): boolean {
  if (!orgIdOrSlug) return false;
  const key = orgIdOrSlug.trim().toLowerCase();
  return key === MANO_KOREPETITORIUS_ORG_ID || key === MANO_KOREPETITORIUS_SLUG;
}

export function isMoksloVaisiaiOrg(orgIdOrSlug?: string | null): boolean {
  if (!orgIdOrSlug) return false;
  const key = orgIdOrSlug.trim().toLowerCase();
  return key === MOKSLO_VAISIAI_ORG_ID
    || key === MOKSLO_VAISIAI_SLUG
    || key === MOKSLO_VAISIAI_DEMO_ORG_ID
    || key === MOKSLO_VAISIAI_DEMO_SLUG;
}

export function isProKlaseOrg(orgIdOrSlug?: string | null): boolean {
  if (!orgIdOrSlug) return false;
  const key = orgIdOrSlug.trim().toLowerCase();
  return (
    key === PRO_KLASE_ORG_ID ||
    key === PRO_KLASE_QA_ORG_ID ||
    key === 'proklase' ||
    key === 'proklase-qa' ||
    key.startsWith('proklase-')
  );
}

/** Pro Klasė never uses waitlist — hide UI and skip auto-fill everywhere. */
export function isWaitlistHiddenForOrg(orgIdOrSlug?: string | null): boolean {
  return isProKlaseOrg(orgIdOrSlug);
}

/** Pro Klasė never shows in-app instructions (admin / tutor / student). */
export function isInstructionsHiddenForOrg(orgIdOrSlug?: string | null): boolean {
  return isProKlaseOrg(orgIdOrSlug);
}

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

export function orgBaseFromPayerChargedTotal(
  payerTotal: number,
  profile: OrgFeeProfile | null | undefined,
  market: TutlioMarket = 'default',
): number {
  const total = Math.round(Number(payerTotal) * 100) / 100;
  if (!Number.isFinite(total) || total <= 0) return 0;

  const netBeforeStripe = total * (1 - MARKET_FEES.stripePercent);
  const stripeFixed = stripeFixedFee(market);

  if (!profile) {
    const base = (netBeforeStripe - stripeFixed) / (1 + MARKET_FEES.platformPercent);
    const rounded = Math.round(base * 100) / 100;
    if (rounded > 0 && Math.abs(customerTotal(rounded, market, null) - total) <= 0.01) return rounded;
    return total;
  }

  if (isProKlaseFeeProfile(profile)) {
    const baseLow = netBeforeStripe - stripeFixed;
    const roundedLow = Math.round(baseLow * 100) / 100;
    if (roundedLow > 0 && roundedLow <= PRO_KLASE_LOW_TIER_MAX_BASE
      && Math.abs(customerTotal(roundedLow, market, profile) - total) <= 0.01) {
      return roundedLow;
    }
    const baseHigh = (total - PRO_KLASE_HIGH_TIER_FIXED_EUR) / (1 + PRO_KLASE_HIGH_TIER_PERCENT);
    const roundedHigh = Math.round(baseHigh * 100) / 100;
    if (roundedHigh > PRO_KLASE_LOW_TIER_MAX_BASE
      && Math.abs(customerTotal(roundedHigh, market, profile) - total) <= 0.01) {
      return roundedHigh;
    }
    return total;
  }

  let lower = 0;
  for (const tier of profile.tiers) {
    const base = (netBeforeStripe - stripeFixed - tier.fixed) / (1 + tier.percent);
    const upper = tier.maxBase;
    const inBand = base > lower && (upper === Infinity || base <= upper);
    if (inBand && Math.abs(customerTotal(base, market, profile) - total) <= 0.01) {
      return Math.round(base * 100) / 100;
    }
    if (upper !== Infinity) lower = upper;
  }
  return total;
}

export function customerTotal(
  baseAmount: number,
  market: TutlioMarket = 'default',
  feeProfile?: OrgFeeProfile | null,
  feeSplit?: OrgPayerFeeSplit | null,
): number {
  if (isProKlaseFeeProfile(feeProfile)) {
    return proKlaseCustomerTotal(baseAmount, market);
  }
  const fixed = stripeFixedFee(market);
  if (feeSplit) {
    const payerPlatform = baseAmount * MARKET_FEES.platformPercent * payerFeeSplitShare01(feeSplit.platformShare);
    const payerStripeFixed = fixed * payerFeeSplitShare01(feeSplit.stripeFixedShare);
    const payerStripeRate = MARKET_FEES.stripePercent * payerFeeSplitShare01(feeSplit.stripePercentShare);
    if (payerStripeRate <= 0) {
      return Math.round((baseAmount + payerPlatform + payerStripeFixed) * 100) / 100;
    }
    return Math.round(((baseAmount + payerPlatform + payerStripeFixed) / (1 - payerStripeRate)) * 100) / 100;
  }
  const platformFee = baseAmount * MARKET_FEES.platformPercent;
  return (baseAmount + platformFee + fixed) / (1 - MARKET_FEES.stripePercent);
}

export function lessonCheckoutBreakdownCents(
  baseAmount: number,
  market: TutlioMarket = 'default',
  feeProfile?: OrgFeeProfile | null,
  feeSplit?: OrgPayerFeeSplit | null,
): { baseCents: number; feesCents: number; totalCents: number } {
  const total = customerTotal(baseAmount, market, feeProfile, feeSplit);
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
