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
  MARKET_FEES,
} from './marketMoney';

export const STRIPE_FEE_PERCENT = MARKET_FEES.stripePercent;
export const STRIPE_FEE_FIXED_EUR = MARKET_FEES.stripeFixed.eur;
export const PLATFORM_FEE_PERCENT = MARKET_FEES.platformPercent;

const market = () => currentMarket();

/** @deprecated Use customerTotal(amount, market) */
export function customerTotalEur(lessonPriceEur: number): number {
  return customerTotal(lessonPriceEur, market());
}

export function formatCustomerChargeEur(lessonPrice: number | null | undefined): string {
  const p = Number(lessonPrice);
  if (!Number.isFinite(p) || p <= 0) return '—';
  return formatMarketAmount(customerTotal(p, market()), market());
}

/** @deprecated Use lessonStripeBreakdown */
export function lessonStripeBreakdownEur(lessonPrice: number) {
  return lessonStripeBreakdown(lessonPrice, market());
}

/** @deprecated Use formatLessonStripeCharge */
export function formatLessonStripeChargeEur(
  lessonBasePrice: number | null | undefined,
  tutorOrganizationIsSchool: boolean,
): string {
  return formatLessonStripeCharge(lessonBasePrice, tutorOrganizationIsSchool, market());
}

export {
  customerTotal,
  lessonCheckoutBreakdownCents,
  formatLessonStripeCharge,
  lessonStripeBreakdown,
  formatMarketAmount,
};
