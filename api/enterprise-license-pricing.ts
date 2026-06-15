// GET /api/enterprise-license-pricing
// Public endpoint returning enterprise license tiers (volume bands) so the
// pricing slider matches checkout. Stripe price must use tiers_mode=volume.

import type { VercelRequest, VercelResponse } from './types.js';
import Stripe from 'stripe';
import { marketFromRequest, type TutlioMarket } from './_lib/market.js';
import { getEnterpriseLicenseBounds, getEnterprisePriceId } from './_lib/enterprise-license.js';
import { enterprisePlnTierDefs, ENTERPRISE_PLN } from '../src/lib/enterprisePricingPln.js';
import { enterpriseEurTierDefs, ENTERPRISE_EUR } from '../src/lib/enterprisePricingEur.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' as any });

interface LicenseTier {
  /** Upper bound of the tier (inclusive), null = infinite last tier. */
  upTo: number | null;
  unitAmountCents: number;
  flatAmountCents: number;
}

interface PricingPayload {
  currency: string;
  interval: 'month' | 'year';
  tiersMode: 'volume' | 'graduated';
  tiers: LicenseTier[];
  minLicenses: number;
  maxSelfServe: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cacheByMarket = new Map<string, { payload: PricingPayload; expiresAt: number }>();

function canonicalPayload(market: TutlioMarket): PricingPayload {
  const { minLicenses, maxSelfServe } = getEnterpriseLicenseBounds();
  if (market === 'pl') {
    return {
      currency: 'pln',
      interval: 'month',
      tiersMode: ENTERPRISE_PLN.tiersMode,
      tiers: enterprisePlnTierDefs(),
      minLicenses,
      maxSelfServe,
    };
  }
  return {
    currency: 'eur',
    interval: 'month',
    tiersMode: ENTERPRISE_EUR.tiersMode,
    tiers: enterpriseEurTierDefs(),
    minLicenses,
    maxSelfServe,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const market = marketFromRequest(req);
    const cached = cacheByMarket.get(market);
    if (cached && cached.expiresAt > Date.now()) {
      return res.status(200).json(cached.payload);
    }

    const priceId = getEnterprisePriceId(market);
    if (!priceId) {
      const payload = canonicalPayload(market);
      cacheByMarket.set(market, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
      return res.status(200).json(payload);
    }

    const price = await stripe.prices.retrieve(priceId);
    if (price.type !== 'recurring' || !price.recurring) {
      return res.status(500).json({ error: 'Enterprise license price must be a recurring Stripe price.' });
    }
    if (price.billing_scheme !== 'tiered' || price.tiers_mode !== 'volume') {
      console.warn(
        `[enterprise-license-pricing] ${priceId} should be tiered volume; got ${price.billing_scheme}/${price.tiers_mode}`,
      );
    }

    const payload = canonicalPayload(market);
    payload.currency = price.currency;
    payload.interval = price.recurring.interval === 'year' ? 'year' : 'month';

    cacheByMarket.set(market, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
    return res.status(200).json(payload);
  } catch (error: any) {
    console.error('[enterprise-license-pricing] Error:', error?.message || error);
    const market = marketFromRequest(req);
    const payload = canonicalPayload(market);
    cacheByMarket.set(market, { payload, expiresAt: Date.now() + CACHE_TTL_MS });
    return res.status(200).json(payload);
  }
}
