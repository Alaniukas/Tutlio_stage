/**
 * Client pays: lesson price + platform % + estimated Stripe processing fee.
 * On tutlio.pl amounts and Stripe charges are PLN; elsewhere EUR.
 */
import type { TutlioMarket } from './market.js';
import {
  customerTotal,
  lessonCheckoutBreakdownCents,
  MARKET_FEES,
  stripeFixedFee,
  type OrgFeeProfile,
} from './marketMoney.js';

export const STRIPE_FEE_PERCENT = MARKET_FEES.stripePercent;
export const PLATFORM_FEE_PERCENT = MARKET_FEES.platformPercent;
export const STRIPE_FEE_FIXED_EUR = MARKET_FEES.stripeFixed.eur;

/** @deprecated Use customerTotal(amount, market) */
export function customerTotalEur(lessonPriceEur: number, feeProfile?: OrgFeeProfile | null): number {
  return customerTotal(lessonPriceEur, 'default', feeProfile);
}

export { customerTotal, lessonCheckoutBreakdownCents };

export function packageCustomerTotal(basePackagePrice: number, market: TutlioMarket = 'default'): number {
  return customerTotal(basePackagePrice, market);
}

export function stripeFixedFeeForMarket(market: TutlioMarket): number {
  return stripeFixedFee(market);
}
