import type { Locale } from './i18n/locales.js';
import type { TutlioMarket } from './market.js';

/**
 * Subscription currency by market and interface language.
 *
 * tutlio.pl bills in PLN whatever the interface language. Elsewhere the
 * currency follows the locale: euro-area languages stay on EUR, and
 * languages whose market has no supported local currency see and pay USD.
 * USD amounts live in src/lib/pricing.ts (TUTOR_PLANS_USD) and Stripe charges
 * them through the multi-currency options that `npm run stripe:setup-usd`
 * adds to the existing EUR prices, so no extra price IDs are involved.
 *
 * Bulgaria adopted the euro on 1 January 2026 and Croatia on 1 January 2023,
 * so `bg` and `hr` are euro locales. Czech, Hungarian and Romanian markets keep
 * their own currencies, which Tutlio does not support, so they bill in USD.
 */
export type SubscriptionCurrency = 'EUR' | 'PLN' | 'USD';

export const USD_LOCALES: readonly Locale[] = [
  'cs', 'hu', 'ro',
  'tr', 'uk', 'he', 'ar',
  'hi', 'id', 'fil', 'ko', 'ja', 'th', 'zh-hk',
  'pt-br', 'es-mx',
];

export function isUsdLocale(locale: string | null | undefined): boolean {
  return !!locale && (USD_LOCALES as readonly string[]).includes(locale);
}

export function subscriptionCurrencyFor(market: TutlioMarket, locale?: string | null): SubscriptionCurrency {
  if (market === 'pl') return 'PLN';
  if (isUsdLocale(locale)) return 'USD';
  return 'EUR';
}

/** Lower-case ISO code in the form Stripe expects. */
export function stripeCurrencyCode(currency: SubscriptionCurrency): 'eur' | 'pln' | 'usd' {
  return currency.toLowerCase() as 'eur' | 'pln' | 'usd';
}
