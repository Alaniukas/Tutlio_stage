import { useMemo } from 'react';
import { currentMarket, type TutlioMarket } from '@/lib/market';
import {
  formatMarketAmount,
  formatLessonStripeCharge,
  lessonStripeBreakdown,
  customerTotal,
  type OrgFeeProfile,
} from '@/lib/marketMoney';
import type { OrgPayerFeeSplit } from '@/lib/orgPayerFeeSplit';

/** Market-aware money formatting for tutlio.pl (PLN) vs .lt/.com (EUR). */
export function useMarketMoney() {
  const market = currentMarket();
  return useMemo(
    () => ({
      market,
      fmt: (amount: number | null | undefined, opts?: { decimals?: number }) =>
        formatMarketAmount(amount, market, opts),
      formatLessonCharge: (
        base: number | null | undefined,
        tutorOrganizationIsSchool: boolean,
        feeProfile?: OrgFeeProfile | null,
        feeSplit?: OrgPayerFeeSplit | null,
      ) => formatLessonStripeCharge(base, tutorOrganizationIsSchool, market, feeProfile, feeSplit),
      lessonBreakdown: (base: number, feeProfile?: OrgFeeProfile | null, feeSplit?: OrgPayerFeeSplit | null) =>
        lessonStripeBreakdown(base, market, feeProfile, feeSplit),
      customerTotal: (base: number, feeProfile?: OrgFeeProfile | null, feeSplit?: OrgPayerFeeSplit | null) =>
        customerTotal(base, market, feeProfile, feeSplit),
      isPl: market === 'pl',
    }),
    [market],
  );
}

export type MarketMoney = ReturnType<typeof useMarketMoney>;
