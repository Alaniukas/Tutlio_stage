import { useTranslation } from '@/lib/i18n';
import { currentMarket } from '@/lib/market';
import { subscriptionCurrencyFor, type SubscriptionCurrency } from '@/lib/localeCurrency';

/** PLN on tutlio.pl, USD for locales without a supported local currency, EUR otherwise. */
export function useSubscriptionCurrency(): SubscriptionCurrency {
  const { locale } = useTranslation();
  return subscriptionCurrencyFor(currentMarket(), locale);
}
