/**
 * Single source of truth for tutor subscription prices shown anywhere —
 * SPA pages, bot-SSR pages, JSON-LD offers, and llms.txt. Stripe checkout
 * resolves actual charges from STRIPE_*_PRICE_ID envs; when those change,
 * update this file in the same deploy so humans, crawlers, and AI assistants
 * all quote the same numbers (tests/lib/pricing-sync.test.ts guards this).
 */
export const TUTOR_PLANS = {
  monthly: { pricePerMonthEur: 19.99 },
  yearly: { pricePerMonthEur: 14.99, pricePerYearEur: 179.88 },
  subscriptionOnly: { pricePerMonthEur: 35 },
} as const;

/** "€19.99" / "€35" — matches how prices have always been rendered in the UI. */
export function eur(amount: number): string {
  return `€${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}
