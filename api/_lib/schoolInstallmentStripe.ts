/**
 * School org Connect charges (installments, per-lesson, packages, invoices):
 * payer pays the list amount only; Tutlio keeps 1%, estimated Stripe bundle 1.5% + €0.25,
 * remainder to the school's Connect account (`application_fee_amount` on Checkout).
 */

export const SCHOOL_INSTALLMENT_TUTLIO_PERCENT = 0.01;
export const SCHOOL_INSTALLMENT_STRIPE_PERCENT = 0.015;
export const SCHOOL_INSTALLMENT_STRIPE_FIXED_EUR = 0.25;

export function schoolInstallmentCheckoutCents(amountEur: number): {
  chargeCents: number;
  transferToSchoolCents: number;
} {
  const tutlioFeeEur = amountEur * SCHOOL_INSTALLMENT_TUTLIO_PERCENT;
  const stripeEstimateEur = amountEur * SCHOOL_INSTALLMENT_STRIPE_PERCENT + SCHOOL_INSTALLMENT_STRIPE_FIXED_EUR;
  const schoolNetEur = amountEur - tutlioFeeEur - stripeEstimateEur;
  return {
    chargeCents: Math.round(amountEur * 100),
    transferToSchoolCents: Math.max(0, Math.round(schoolNetEur * 100)),
  };
}
