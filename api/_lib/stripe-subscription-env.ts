import type { TutlioMarket } from './market.js';

function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v || undefined;
}

/** Stripe product/price env keys for tutor subscription plans (EUR or PLN). */
export function stripeSubscriptionEnv(market: TutlioMarket) {
  const suffix = market === 'pl' ? '_PLN' : '';
  return {
    monthlyProductId: env(`STRIPE_MONTHLY_PRODUCT_ID${suffix}`),
    monthlyPriceId: env(`STRIPE_MONTHLY_PRICE_ID${suffix}`),
    yearlyProductId: env(`STRIPE_YEARLY_PRODUCT_ID${suffix}`),
    yearlyPriceId: env(`STRIPE_YEARLY_PRICE_ID${suffix}`),
    subscriptionOnlyProductId: env(`STRIPE_SUBSCRIPTION_ONLY_PRODUCT_ID${suffix}`),
    subscriptionOnlyPriceId: env(`STRIPE_SUBSCRIPTION_ONLY_PRICE_ID${suffix}`),
    subscriptionOnlyYearlyPriceId: env(`STRIPE_SUBSCRIPTION_ONLY_YEARLY_PRICE_ID${suffix}`),
  };
}

/** Recognize subscription_only across EUR and PLN Stripe prices. */
export function isSubscriptionOnlyPriceId(
  price: string | { id?: string; metadata?: Record<string, string> } | undefined,
): boolean {
  if (!price) return false;
  if (typeof price !== 'string' && price.metadata?.plan === 'subscription_only') return true;
  const priceId = typeof price === 'string' ? price : price.id;
  if (!priceId) return false;
  const ids = [
    env('STRIPE_SUBSCRIPTION_ONLY_PRICE_ID'),
    env('STRIPE_SUBSCRIPTION_ONLY_YEARLY_PRICE_ID'),
    env('STRIPE_SUBSCRIPTION_ONLY_PRICE_ID_PLN'),
    env('STRIPE_SUBSCRIPTION_ONLY_YEARLY_PRICE_ID_PLN'),
  ].filter(Boolean) as string[];
  return ids.includes(priceId);
}
