/**
 * School org Connect charges: payer pays list amount; Tutlio 1%, Stripe estimate, rest to school.
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
): { chargeCents: number; transferToSchoolCents: number } {
  return schoolInstallmentCheckoutCentsCore(amount, market);
}
