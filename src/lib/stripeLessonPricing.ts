/** Synced with api/_lib/stripeLessonPricing.ts — UI shows the same total as Checkout. */

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
