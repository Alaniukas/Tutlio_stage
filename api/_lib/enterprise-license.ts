import type { TutlioMarket } from './market.js';
import { ENTERPRISE_EUR } from '../../src/lib/enterprisePricingEur.js';

/** Shared config for enterprise self-serve license billing. */

export function getEnterprisePriceId(market: TutlioMarket = 'default'): string | undefined {
  const key = market === 'pl' ? 'STRIPE_ENTERPRISE_PRICE_ID_PLN' : 'STRIPE_ENTERPRISE_PRICE_ID';
  const id = process.env[key]?.trim();
  return id || undefined;
}

/** Recognize enterprise license prices across EUR and PLN Stripe products. */
export function isEnterpriseLicensePriceId(priceId: string | undefined): boolean {
  if (!priceId) return false;
  const ids = [
    process.env.STRIPE_ENTERPRISE_PRICE_ID?.trim(),
    process.env.STRIPE_ENTERPRISE_PRICE_ID_PLN?.trim(),
  ].filter(Boolean) as string[];
  return ids.includes(priceId);
}

/** Self-serve bounds: counts above maxSelfServe go through sales contact instead. */
export function getEnterpriseLicenseBounds(): { minLicenses: number; maxSelfServe: number } {
  const min = Math.max(1, Math.floor(Number(process.env.ENTERPRISE_MIN_LICENSES) || 1));
  const max = Math.max(min, Math.floor(Number(process.env.ENTERPRISE_MAX_SELF_SERVE_LICENSES) || ENTERPRISE_EUR.maxSelfServe));
  return { minLicenses: min, maxSelfServe: max };
}
