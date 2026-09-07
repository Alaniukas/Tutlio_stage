import { currentMarket } from './market.js';
import { TUTOR_PLANS, TUTOR_PLANS_USD, eur, usd } from './pricing.js';
import { subscriptionPriceLabels } from './subscriptionPricing.js';
import { subscriptionCurrencyFor, type SubscriptionCurrency } from './localeCurrency.js';
import { getLocaleFromPathname, getStoredLocale } from './i18n/index.js';

/**
 * Currency for the page the visitor is on: PLN on tutlio.pl, USD for interface
 * languages whose market has no supported local currency, EUR otherwise. The
 * URL locale wins; app pages without a prefix fall back to the stored choice.
 */
export function currentSubscriptionCurrency(): SubscriptionCurrency {
  const locale =
    typeof window === 'undefined'
      ? null
      : getLocaleFromPathname(window.location.pathname) ?? getStoredLocale();
  return subscriptionCurrencyFor(currentMarket(), locale);
}

const resolve = (currency?: SubscriptionCurrency) => currency ?? currentSubscriptionCurrency();

/** Tutor plan price labels — pass the currency from useSubscriptionCurrency() in components. */
export const tutorPlanPriceLabels = {
  monthly: (currency?: SubscriptionCurrency) => {
    const c = resolve(currency);
    if (c === 'PLN') return subscriptionPriceLabels.monthly();
    if (c === 'USD') return usd(TUTOR_PLANS_USD.monthly.pricePerMonth);
    return eur(TUTOR_PLANS.monthly.pricePerMonthEur);
  },
  yearlyPerMonth: (currency?: SubscriptionCurrency) => {
    const c = resolve(currency);
    if (c === 'PLN') return subscriptionPriceLabels.yearlyPerMonth();
    if (c === 'USD') return usd(TUTOR_PLANS_USD.yearly.pricePerMonth);
    return eur(TUTOR_PLANS.yearly.pricePerMonthEur);
  },
  yearlyTotal: (currency?: SubscriptionCurrency) => {
    const c = resolve(currency);
    if (c === 'PLN') return subscriptionPriceLabels.yearlyTotal();
    if (c === 'USD') return usd(TUTOR_PLANS_USD.yearly.pricePerYear);
    return eur(TUTOR_PLANS.yearly.pricePerYearEur);
  },
  subscriptionOnly: (currency?: SubscriptionCurrency) => {
    const c = resolve(currency);
    if (c === 'PLN') return subscriptionPriceLabels.subscriptionOnly();
    if (c === 'USD') return usd(TUTOR_PLANS_USD.subscriptionOnly.pricePerMonth);
    return eur(TUTOR_PLANS.subscriptionOnly.pricePerMonthEur);
  },
  subscriptionOnlyYearlyPerMonth: (currency?: SubscriptionCurrency) => {
    const c = resolve(currency);
    if (c === 'PLN') return subscriptionPriceLabels.subscriptionOnlyYearlyPerMonth();
    if (c === 'USD') return usd(TUTOR_PLANS_USD.subscriptionOnly.yearlyPricePerMonth);
    return eur(TUTOR_PLANS.subscriptionOnly.yearlyPricePerMonthEur);
  },
  subscriptionOnlyYearlyTotal: (currency?: SubscriptionCurrency) => {
    const c = resolve(currency);
    if (c === 'PLN') return subscriptionPriceLabels.subscriptionOnlyYearlyTotal();
    if (c === 'USD') return usd(TUTOR_PLANS_USD.subscriptionOnly.pricePerYear);
    return eur(TUTOR_PLANS.subscriptionOnly.pricePerYearEur);
  },
};

/** PLN labels already include "/mies."; EUR and USD use the separate common.perMonth suffix. */
export function showPerMonthSuffix(currency?: SubscriptionCurrency): boolean {
  return resolve(currency) !== 'PLN';
}
