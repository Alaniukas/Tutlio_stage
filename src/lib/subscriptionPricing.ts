import { formatPln } from './formatPln';

/**
 * tutlio.pl subscription list prices in PLN.
 * Stripe charges use STRIPE_*_PRICE_ID_PLN on tutlio.pl, EUR envs elsewhere.
 */
export const SUBSCRIPTION_PLN = {
  monthly: 85.99,
  yearlyPerMonth: 64.99,
  yearlyTotal: 773.88,
  yearlySave: 258,
  subscriptionOnly: 149.99,
} as const;

export function formatSubscriptionPln(amount: number, opts?: { perMonth?: boolean }) {
  const base = formatPln(amount);
  return opts?.perMonth ? `${base}/mies.` : base;
}

export const subscriptionPriceLabels = {
  monthly: () => formatSubscriptionPln(SUBSCRIPTION_PLN.monthly, { perMonth: true }),
  yearlyPerMonth: () => formatSubscriptionPln(SUBSCRIPTION_PLN.yearlyPerMonth, { perMonth: true }),
  yearlyTotal: () => formatPln(SUBSCRIPTION_PLN.yearlyTotal),
  subscriptionOnly: () => formatSubscriptionPln(SUBSCRIPTION_PLN.subscriptionOnly, { perMonth: true }),
} as const;
