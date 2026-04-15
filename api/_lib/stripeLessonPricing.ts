/**
 * Client pays: lesson price + platform % + estimated Stripe processing fee (from client).
 * When using destination charge (payment on platform account + transfer to Connect),
 * the exact lesson amount (EUR → cents) is transferred to the connected account.
 */
export const STRIPE_FEE_PERCENT = 0.015;
export const STRIPE_FEE_FIXED_EUR = 0.25;
export const PLATFORM_FEE_PERCENT = 0.02;

/** Total EUR amount the client pays (1.5% + €0.25 charged on the total — platform, not tutor). */
export function customerTotalEur(lessonPriceEur: number): number {
  const platformFeeEur = lessonPriceEur * PLATFORM_FEE_PERCENT;
  return (lessonPriceEur + platformFeeEur + STRIPE_FEE_FIXED_EUR) / (1 - STRIPE_FEE_PERCENT);
}

export function lessonCheckoutBreakdownCents(lessonPriceEur: number): {
  baseCents: number;
  feesCents: number;
  totalCents: number;
} {
  const totalEur = customerTotalEur(lessonPriceEur);
  const totalCents = Math.round(totalEur * 100);
  const baseCents = Math.round(lessonPriceEur * 100);
  const feesCents = totalCents - baseCents;
  return { baseCents, feesCents, totalCents };
}

/** For packages / invoices: same as single lesson, but on the total base amount. */
export function packageCustomerTotalEur(basePackagePriceEur: number): number {
  return customerTotalEur(basePackagePriceEur);
}
