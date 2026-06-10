/**
 * Synced with api/_lib/stripeLessonPricing.ts — lesson/package UI matches Checkout totals.
 * School installments (server-only math): api/_lib/schoolInstallmentStripe.ts
 */

export const STRIPE_FEE_PERCENT = 0.015;
export const STRIPE_FEE_FIXED_EUR = 0.25;
export const PLATFORM_FEE_PERCENT = 0.02;

export function customerTotalEur(lessonPriceEur: number): number {
  const platformFeeEur = lessonPriceEur * PLATFORM_FEE_PERCENT;
  return (lessonPriceEur + platformFeeEur + STRIPE_FEE_FIXED_EUR) / (1 - STRIPE_FEE_PERCENT);
}

/** Formats an amount for payment buttons (2 decimal places). */
export function formatCustomerChargeEur(lessonPriceEur: number | null | undefined): string {
  const p = Number(lessonPriceEur);
  if (!Number.isFinite(p) || p <= 0) return '—';
  return customerTotalEur(p).toFixed(2);
}

/**
 * Mirrors `lessonCheckoutBreakdownCents` in api/_lib/stripeLessonPricing.ts so the
 * in-app breakdown matches the Stripe Checkout line items to the cent.
 */
export function lessonStripeBreakdownEur(lessonPriceEur: number): {
  base: number;
  fee: number;
  total: number;
} {
  const totalCents = Math.round(customerTotalEur(lessonPriceEur) * 100);
  const baseCents = Math.round(lessonPriceEur * 100);
  return {
    base: baseCents / 100,
    fee: (totalCents - baseCents) / 100,
    total: totalCents / 100,
  };
}

/**
 * Matches `api/stripe-checkout.ts`: tutors under org `entity_type = school` use Connect absorption
 * (payer pays list lesson price); others use gross-up (~2% + Stripe estimate).
 */
export function formatLessonStripeChargeEur(
  lessonBasePriceEur: number | null | undefined,
  tutorOrganizationIsSchool: boolean,
): string {
  const p = Number(lessonBasePriceEur);
  if (!Number.isFinite(p) || p <= 0) return '—';
  return tutorOrganizationIsSchool ? p.toFixed(2) : customerTotalEur(p).toFixed(2);
}
