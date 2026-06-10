// GET /api/enterprise-license-pricing
// Public endpoint returning the enterprise license price tiers straight from
// Stripe so the pricing page slider always matches what checkout charges.

import type { VercelRequest, VercelResponse } from './types.js';
import Stripe from 'stripe';
import { getEnterpriseLicenseBounds, getEnterprisePriceId } from './_lib/enterprise-license.js';

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
let cache: { payload: PricingPayload; expiresAt: number } | null = null;

function tierAmountCents(amount: number | null, decimal: string | null | undefined): number {
  if (typeof amount === 'number') return amount;
  const parsed = Number(decimal);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (cache && cache.expiresAt > Date.now()) {
      return res.status(200).json(cache.payload);
    }

    const priceId = getEnterprisePriceId();
    if (!priceId) {
      return res.status(500).json({ error: 'Enterprise pricing is not configured. Set STRIPE_ENTERPRISE_PRICE_ID.' });
    }

    const price = await stripe.prices.retrieve(priceId, { expand: ['tiers'] });
    if (price.type !== 'recurring' || !price.recurring) {
      return res.status(500).json({ error: 'Enterprise license price must be a recurring Stripe price.' });
    }

    let tiers: LicenseTier[];
    if (price.billing_scheme === 'tiered' && price.tiers?.length) {
      tiers = price.tiers.map((t) => ({
        upTo: t.up_to ?? null,
        unitAmountCents: tierAmountCents(t.unit_amount, t.unit_amount_decimal),
        flatAmountCents: tierAmountCents(t.flat_amount, t.flat_amount_decimal),
      }));
      // Stripe returns tiers ordered, but enforce it: finite bounds ascending, infinite last.
      tiers.sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
    } else if (typeof price.unit_amount === 'number') {
      // Per-unit price: expose as a single infinite tier so the UI works either way.
      tiers = [{ upTo: null, unitAmountCents: price.unit_amount, flatAmountCents: 0 }];
    } else {
      return res.status(500).json({ error: 'Enterprise license price has no usable amount configuration.' });
    }

    const { minLicenses, maxSelfServe } = getEnterpriseLicenseBounds();
    const payload: PricingPayload = {
      currency: price.currency,
      interval: price.recurring.interval === 'year' ? 'year' : 'month',
      tiersMode: price.tiers_mode === 'graduated' ? 'graduated' : 'volume',
      tiers,
      minLicenses,
      maxSelfServe,
    };

    cache = { payload, expiresAt: Date.now() + CACHE_TTL_MS };
    return res.status(200).json(payload);
  } catch (error: any) {
    console.error('[enterprise-license-pricing] Error:', error?.message || error);
    return res.status(500).json({ error: 'Failed to load enterprise pricing' });
  }
}
