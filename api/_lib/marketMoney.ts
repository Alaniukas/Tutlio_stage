import type { TutlioMarket } from './market.js';

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

export function checkoutBaseMetadata(
  baseAmount: number,
  market: TutlioMarket,
): Record<string, string> {
  const currency = chargeCurrency(market);
  return {
    tutlio_base_eur: baseAmount.toFixed(2),
    tutlio_base_amount: baseAmount.toFixed(2),
    tutlio_currency: currency,
  };
}

export function metadataBaseAmount(
  metadata: Record<string, string> | null | undefined,
): number | null {
  const raw = metadata?.tutlio_base_amount ?? metadata?.tutlio_base_eur;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function metadataCurrency(
  metadata: Record<string, string> | null | undefined,
): ChargeCurrency {
  const c = metadata?.tutlio_currency?.toLowerCase();
  return c === 'pln' ? 'pln' : 'eur';
}

export function creditNote(amount: number, market: TutlioMarket): string {
  const formatted =
    market === 'pl'
      ? `${amount.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\u00a0zł`
      : `€${amount.toFixed(2)}`;
  return market === 'pl' ? ` (kredyt -${formatted})` : ` (kreditas -${formatted})`;
}
