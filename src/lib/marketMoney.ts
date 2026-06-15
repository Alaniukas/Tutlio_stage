import type { TutlioMarket } from './market';
import { currentMarket } from './market';
import { formatPln } from './formatPln';

export type ChargeCurrency = 'eur' | 'pln';

export const MARKET_FEES = {
  platformPercent: 0.02,
  stripePercent: 0.015,
  stripeFixed: { eur: 0.25, pln: 1.0 },
  schoolTutlioPercent: 0.01,
} as const;

export function chargeCurrency(market: TutlioMarket): ChargeCurrency {
  return market === 'pl' ? 'pln' : 'eur';
}

export function stripeFixedFee(market: TutlioMarket): number {
  return market === 'pl' ? MARKET_FEES.stripeFixed.pln : MARKET_FEES.stripeFixed.eur;
}

/** Total amount the payer is charged (lesson/package base + platform % + Stripe estimate). */
export function customerTotal(baseAmount: number, market: TutlioMarket = 'default'): number {
  const platformFee = baseAmount * MARKET_FEES.platformPercent;
  const fixed = stripeFixedFee(market);
  return (baseAmount + platformFee + fixed) / (1 - MARKET_FEES.stripePercent);
}

export function lessonCheckoutBreakdownCents(
  baseAmount: number,
  market: TutlioMarket = 'default',
): { baseCents: number; feesCents: number; totalCents: number } {
  const total = customerTotal(baseAmount, market);
  const totalCents = Math.round(total * 100);
  const baseCents = Math.round(baseAmount * 100);
  return { baseCents, feesCents: totalCents - baseCents, totalCents };
}

export function schoolInstallmentCheckoutCents(
  amount: number,
  market: TutlioMarket = 'default',
): { chargeCents: number; transferToSchoolCents: number } {
  const tutlioFee = amount * MARKET_FEES.schoolTutlioPercent;
  const stripeEstimate = amount * MARKET_FEES.stripePercent + stripeFixedFee(market);
  const schoolNet = amount - tutlioFee - stripeEstimate;
  return {
    chargeCents: Math.round(amount * 100),
    transferToSchoolCents: Math.max(0, Math.round(schoolNet * 100)),
  };
}

export function formatMarketAmount(
  amount: number | null | undefined,
  market: TutlioMarket = 'default',
  opts?: { decimals?: number },
): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return '—';
  if (market === 'pl') return formatPln(n, { decimals: opts?.decimals });
  const decimals = opts?.decimals ?? 2;
  return `€${n.toFixed(decimals)}`;
}

/** Client shorthand — format amount for current host market. */
export function fmtMoney(
  amount: number | null | undefined,
  opts?: { decimals?: number },
): string {
  return formatMarketAmount(amount, currentMarket(), opts);
}

export function formatLessonStripeCharge(
  lessonBasePrice: number | null | undefined,
  tutorOrganizationIsSchool: boolean,
  market: TutlioMarket = 'default',
): string {
  const p = Number(lessonBasePrice);
  if (!Number.isFinite(p) || p <= 0) return '—';
  const charge = tutorOrganizationIsSchool ? p : customerTotal(p, market);
  return market === 'pl'
    ? formatPln(charge)
    : `€${charge.toFixed(2)}`;
}

export function lessonStripeBreakdown(
  lessonPrice: number,
  market: TutlioMarket = 'default',
): { base: number; fee: number; total: number } {
  const { baseCents, feesCents, totalCents } = lessonCheckoutBreakdownCents(lessonPrice, market);
  return {
    base: baseCents / 100,
    fee: feesCents / 100,
    total: totalCents / 100,
  };
}

export function creditNote(amount: number, market: TutlioMarket = 'default'): string {
  return ` (kredyt -${formatMarketAmount(amount, market)})`;
}
