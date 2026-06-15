import { useMemo } from 'react';
import { currentMarket, type TutlioMarket } from '@/lib/market';
import {
  formatMarketAmount,
  formatLessonStripeCharge,
  lessonStripeBreakdown,
  customerTotal,
} from '@/lib/marketMoney';

/** Market-aware money formatting for tutlio.pl (PLN) vs .lt/.com (EUR). */
export function useMarketMoney() {
  const market = currentMarket();
  return useMemo(
    () => ({
      market,
      fmt: (amount: number | null | undefined, opts?: { decimals?: number }) =>
        formatMarketAmount(amount, market, opts),
      formatLessonCharge: (base: number | null | undefined, tutorOrganizationIsSchool: boolean) =>
        formatLessonStripeCharge(base, tutorOrganizationIsSchool, market),
      lessonBreakdown: (base: number) => lessonStripeBreakdown(base, market),
      customerTotal: (base: number) => customerTotal(base, market),
      isPl: market === 'pl',
    }),
    [market],
  );
}

export type MarketMoney = ReturnType<typeof useMarketMoney>;
