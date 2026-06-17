/**
 * Synced with api/_lib/stripeLessonPricing.ts + marketMoney.ts
 */
import { currentMarket } from './market';
import {
  customerTotal,
  lessonCheckoutBreakdownCents,
  formatLessonStripeCharge,
  lessonStripeBreakdown,
  formatMarketAmount,
  orgFeeProfile,
  MARKET_FEES,
  type OrgFeeProfile,
} from './marketMoney';

export const STRIPE_FEE_PERCENT = MARKET_FEES.stripePercent;
export const STRIPE_FEE_FIXED_EUR = MARKET_FEES.stripeFixed.eur;
export const PLATFORM_FEE_PERCENT = MARKET_FEES.platformPercent;

const market = () => currentMarket();

/** @deprecated Use customerTotal(amount, market) */
export function customerTotalEur(lessonPriceEur: number, feeProfile?: OrgFeeProfile | null): number {
  return customerTotal(lessonPriceEur, market(), feeProfile);
}

export function formatCustomerChargeEur(
  lessonPrice: number | null | undefined,
  feeProfile?: OrgFeeProfile | null,
): string {
  const p = Number(lessonPrice);
  if (!Number.isFinite(p) || p <= 0) return '—';
  return formatMarketAmount(customerTotal(p, market(), feeProfile), market());
}

/** @deprecated Use lessonStripeBreakdown */
export function lessonStripeBreakdownEur(lessonPrice: number, feeProfile?: OrgFeeProfile | null) {
  return lessonStripeBreakdown(lessonPrice, market(), feeProfile);
}

/** @deprecated Use formatLessonStripeCharge */
export function formatLessonStripeChargeEur(
  lessonBasePrice: number | null | undefined,
  tutorOrganizationIsSchool: boolean,
  feeProfile?: OrgFeeProfile | null,
): string {
  return formatLessonStripeCharge(lessonBasePrice, tutorOrganizationIsSchool, market(), feeProfile);
}

export {
  customerTotal,
  lessonCheckoutBreakdownCents,
  formatLessonStripeCharge,
  lessonStripeBreakdown,
  formatMarketAmount,
  orgFeeProfile,
};
export type { OrgFeeProfile };
