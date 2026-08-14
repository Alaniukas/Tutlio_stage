// POST /api/org-license-portal
// Stripe Billing Portal session for an organization's license subscription
// (update quantity, payment method, cancel). Org admin auth required.

import type { VercelRequest, VercelResponse } from './types.js';
import Stripe from 'stripe';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import { createClient } from '@supabase/supabase-js';
import { publicOriginFromRequest } from './_lib/public-origin.js';
import { marketFromRequest } from './_lib/market.js';
import { getEnterprisePriceId } from './_lib/enterprise-license.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' as any });
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PORTAL_CONFIG_METADATA_KEY = 'tutlio_enterprise_portal';
const portalConfigCache = new Map<string, string>();

/**
 * Dedicated Billing Portal configuration with license quantity updates enabled
 * for the enterprise price (the account default config is used by tutor
 * subscriptions and has no quantity updates). One config per Stripe price id.
 */
async function getEnterprisePortalConfigId(priceId: string): Promise<string | undefined> {
  const cached = portalConfigCache.get(priceId);
  if (cached) return cached;

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
  const existing = configs.find(
    (c) => c.metadata?.[PORTAL_CONFIG_METADATA_KEY] === priceId,
  );
  if (existing) {
    const update = existing.features?.subscription_update;
    const quantityEnabled =
      Boolean(update?.enabled) && (update?.default_allowed_updates ?? []).includes('quantity');
    if (!quantityEnabled) {
      await stripe.billingPortal.configurations.update(existing.id, { features });
    }
    portalConfigCache.set(priceId, existing.id);
    return existing.id;
  }

  const created = await stripe.billingPortal.configurations.create({
    features,
    metadata: { [PORTAL_CONFIG_METADATA_KEY]: priceId },
  });
  portalConfigCache.set(priceId, created.id);
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

    const adminAccess = await getOrgAdminAccessByUserId(supabase, user.id);
    if (!adminAccess || !hasOrgAdminPermission(adminAccess.role, adminAccess.permissions, 'settings.edit')) {
      return res.status(403).json({ error: 'Only organization admin can manage licenses' });
    }
    const adminRow = { organization_id: adminAccess.organizationId };

    const { data: org } = await supabase
      .from('organizations')
      .select('id, stripe_customer_id, license_subscription_id')
      .eq('id', adminRow.organization_id)
      .maybeSingle();
    const customerId = (org as any)?.stripe_customer_id as string | undefined;
    const licenseSubscriptionId = (org as any)?.license_subscription_id as string | undefined;
    if (!customerId) {
      return res.status(400).json({
        error: 'Organization has no license subscription yet',
        code: 'NO_SUBSCRIPTION',
      });
    }

    let enterprisePriceId = getEnterprisePriceId(marketFromRequest(req));
    if (licenseSubscriptionId) {
      try {
        const sub = await stripe.subscriptions.retrieve(licenseSubscriptionId);
        const subPriceId = sub.items.data[0]?.price?.id;
        if (subPriceId) enterprisePriceId = subPriceId;
      } catch (e: any) {
        console.warn('[org-license-portal] Could not read subscription price:', e?.message || e);
      }
    }

    const configurationId = enterprisePriceId
      ? await getEnterprisePortalConfigId(enterprisePriceId).catch((e) => {
          console.error('[org-license-portal] Portal config provisioning failed:', e?.message || e);
          return undefined;
        })
      : undefined;

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
