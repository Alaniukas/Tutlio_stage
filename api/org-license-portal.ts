// POST /api/org-license-portal
// Stripe Billing Portal session for an organization's license subscription
// (update quantity, payment method, cancel). Org admin auth required.

import type { VercelRequest, VercelResponse } from './types.js';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { publicOriginFromRequest } from './_lib/public-origin.js';
import { getEnterprisePriceId } from './_lib/enterprise-license.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' as any });
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PORTAL_CONFIG_METADATA_KEY = 'tutlio_enterprise_portal';
let cachedPortalConfigId: string | null = null;

/**
 * Dedicated Billing Portal configuration with license quantity updates enabled
 * for the enterprise price (the account default config is used by tutor
 * subscriptions and has no quantity updates). Found by metadata marker and
 * auto-created when missing, so no manual Dashboard setup is needed.
 */
async function getEnterprisePortalConfigId(): Promise<string | undefined> {
  if (cachedPortalConfigId) return cachedPortalConfigId;
  const priceId = getEnterprisePriceId();
  if (!priceId) return undefined;

  const price = await stripe.prices.retrieve(priceId);
  const productId = typeof price.product === 'string' ? price.product : price.product.id;
  const features: Stripe.BillingPortal.ConfigurationCreateParams['features'] = {
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: { enabled: true, mode: 'at_period_end' },
    subscription_update: {
      enabled: true,
      default_allowed_updates: ['quantity'],
      proration_behavior: 'create_prorations',
      products: [{ product: productId, prices: [priceId] }],
    },
  };

  const { data: configs } = await stripe.billingPortal.configurations.list({ active: true, limit: 100 });
  const existing = configs.find((c) => c.metadata?.[PORTAL_CONFIG_METADATA_KEY] === '1');
  if (existing) {
    // Quantity updates are governed by default_allowed_updates; `products` is
    // ignored on current Stripe API versions, so don't condition on it.
    const update = existing.features?.subscription_update;
    const quantityEnabled =
      Boolean(update?.enabled) && (update?.default_allowed_updates ?? []).includes('quantity');
    if (!quantityEnabled) {
      await stripe.billingPortal.configurations.update(existing.id, { features });
    }
    cachedPortalConfigId = existing.id;
    return existing.id;
  }

  const created = await stripe.billingPortal.configurations.create({
    features,
    metadata: { [PORTAL_CONFIG_METADATA_KEY]: '1' },
  });
  cachedPortalConfigId = created.id;
  return created.id;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: userData, error: userErr } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    const user = userData?.user;
    if (userErr || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: adminRow } = await supabase
      .from('organization_admins')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!adminRow?.organization_id) {
      return res.status(403).json({ error: 'Only organization admin can manage licenses' });
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('id, stripe_customer_id')
      .eq('id', adminRow.organization_id)
      .maybeSingle();
    const customerId = (org as any)?.stripe_customer_id as string | undefined;
    if (!customerId) {
      return res.status(400).json({
        error: 'Organization has no license subscription yet',
        code: 'NO_SUBSCRIPTION',
      });
    }

    // Fall back to the default portal config if provisioning fails (portal
    // still opens, just without the quantity update feature).
    const configurationId = await getEnterprisePortalConfigId().catch((e) => {
      console.error('[org-license-portal] Portal config provisioning failed:', e?.message || e);
      return undefined;
    });

    const appOrigin = publicOriginFromRequest(req);
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appOrigin}/company/tutors?from=stripe_portal`,
      ...(configurationId ? { configuration: configurationId } : {}),
    });

    return res.status(200).json({ url: session.url });
  } catch (error: any) {
    console.error('[org-license-portal] Error:', error?.message || error);
    return res.status(500).json({ error: error.message || 'Failed to create portal session' });
  }
}
