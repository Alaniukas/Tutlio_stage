import { isPlMarket } from './market';
import { TUTOR_PLANS, eur } from './pricing';
import { subscriptionPriceLabels } from './subscriptionPricing';

/** Domain-aware tutor plan price labels — EUR on .lt/.com, PLN on tutlio.pl. */
export const tutorPlanPriceLabels = {
  monthly: () =>
    isPlMarket()
      ? subscriptionPriceLabels.monthly()
      : `${eur(TUTOR_PLANS.monthly.pricePerMonthEur)}`,
  yearlyPerMonth: () =>
    isPlMarket()
      ? subscriptionPriceLabels.yearlyPerMonth()
      : `${eur(TUTOR_PLANS.yearly.pricePerMonthEur)}`,
  subscriptionOnly: () =>
    isPlMarket()
      ? subscriptionPriceLabels.subscriptionOnly()
      : `${eur(TUTOR_PLANS.subscriptionOnly.pricePerMonthEur)}`,
};

/** PLN labels include "/mies."; EUR uses separate common.perMonth. */
export function showPerMonthSuffix(): boolean {
  return !isPlMarket();
}
