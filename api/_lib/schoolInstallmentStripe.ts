/**
 * School direct charges: payer pays the list amount. Tutlio collects 1% through
 * the application fee and Stripe separately deducts its processing fee from the
 * connected school's balance.
 */
import type { TutlioMarket } from './market.js';
import {
  MARKET_FEES,
  schoolInstallmentCheckoutCents as schoolInstallmentCheckoutCentsCore,
} from './marketMoney.js';

export const SCHOOL_INSTALLMENT_TUTLIO_PERCENT = MARKET_FEES.schoolTutlioPercent;
export const SCHOOL_INSTALLMENT_STRIPE_PERCENT = MARKET_FEES.stripePercent;
export const SCHOOL_INSTALLMENT_STRIPE_FIXED_EUR = MARKET_FEES.stripeFixed.eur;

export function schoolInstallmentCheckoutCents(
  amount: number,
  market: TutlioMarket = 'default',
): {
  chargeCents: number;
  applicationFeeCents: number;
  estimatedStripeFeeCents: number;
  transferToSchoolCents: number;
} {
  return schoolInstallmentCheckoutCentsCore(amount, market);
}
