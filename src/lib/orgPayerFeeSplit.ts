import type { TutlioMarket } from './market.js';
import { customerTotal } from './marketMoney.js';

export type OrgPayerFeeSplit = {
  /** 0–100: share of Tutlio platform % paid by the payer */
  platformShare: number;
  /** 0–100: share of Stripe % paid by the payer */
  stripePercentShare: number;
  /** 0–100: share of Stripe fixed fee paid by the payer */
  stripeFixedShare: number;
};

export const DEFAULT_ORG_PAYER_FEE_SPLIT: OrgPayerFeeSplit = {
  platformShare: 100,
  stripePercentShare: 100,
  stripeFixedShare: 100,
};

export const ORG_PAYER_FEE_SPLIT_FEATURE = 'org_payer_fee_split';

function clampShare(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function parseOrgPayerFeeSplitConfig(raw: unknown): OrgPayerFeeSplit {
  const obj = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
  return {
    platformShare: clampShare(obj.platform_share ?? obj.platformShare, DEFAULT_ORG_PAYER_FEE_SPLIT.platformShare),
    stripePercentShare: clampShare(obj.stripe_percent_share ?? obj.stripePercentShare, DEFAULT_ORG_PAYER_FEE_SPLIT.stripePercentShare),
    stripeFixedShare: clampShare(obj.stripe_fixed_share ?? obj.stripeFixedShare, DEFAULT_ORG_PAYER_FEE_SPLIT.stripeFixedShare),
  };
}

export function orgFeaturesHasPayerFeeSplit(features: unknown): boolean {
  if (!features || typeof features !== 'object' || Array.isArray(features)) return false;
  return (features as Record<string, unknown>)[ORG_PAYER_FEE_SPLIT_FEATURE] === true;
}

/** Active split only when the org feature flag is on. */
export function resolveOrgPayerFeeSplit(features: unknown): OrgPayerFeeSplit | null {
  if (!orgFeaturesHasPayerFeeSplit(features)) return null;
  return parseOrgPayerFeeSplitConfig((features as Record<string, unknown>).payer_fee_split);
}

export function payerFeeSplitShare01(percent: number): number {
  return Math.min(1, Math.max(0, percent / 100));
}

/** Org net after absorbing the fee share not passed to the payer (preview / stats). */
export function orgNetFromPayerFeeSplit(
  baseAmount: number,
  market: TutlioMarket = 'default',
  feeSplit: OrgPayerFeeSplit = DEFAULT_ORG_PAYER_FEE_SPLIT,
): number {
  const fullPayerFee = customerTotal(baseAmount, market, null, DEFAULT_ORG_PAYER_FEE_SPLIT) - baseAmount;
  const actualPayerFee = customerTotal(baseAmount, market, null, feeSplit) - baseAmount;
  const orgAbsorbed = Math.max(0, fullPayerFee - actualPayerFee);
  return Math.round((baseAmount - orgAbsorbed) * 100) / 100;
}
