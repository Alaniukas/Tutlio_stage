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
  subscriptionOnly: {
    pricePerMonthEur: 35,
    yearlyPricePerMonthEur: 26.25,
    pricePerYearEur: 315,
  },
} as const;

/** "€19.99" / "€35" — matches how prices have always been rendered in the UI. */
export function eur(amount: number): string {
  return `€${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}

/**
 * USD list prices for interface languages whose market has no supported local
 * currency (USD_LOCALES in src/lib/localeCurrency.ts). Parity with EUR keeps a
 * single price list; Stripe bills USD through the currency_options that
 * `npm run stripe:setup-usd` adds to the EUR prices, so price IDs never change.
 */
export const TUTOR_PLANS_USD = {
  monthly: { pricePerMonth: 19.99 },
  yearly: { pricePerMonth: 14.99, pricePerYear: 179.88 },
  subscriptionOnly: { pricePerMonth: 35, yearlyPricePerMonth: 26.25, pricePerYear: 315 },
} as const;

/** "$19.99" / "$35" — mirrors eur(). */
export function usd(amount: number): string {
  return `$${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
}
