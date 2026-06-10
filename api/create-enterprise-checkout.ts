// POST /api/create-enterprise-checkout
// Instant enterprise license purchase: Stripe subscription checkout with
// quantity = license count (volume-tiered price configured in Stripe).
// Two modes:
//  - Logged-in org admin: licenses applied to their organization by the webhook.
//  - Anonymous new company: org + admin account auto-provisioned by the webhook.

import type { VercelRequest, VercelResponse } from './types.js';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { buildPublicPath, publicOriginFromRequest, type CheckoutAudience } from './_lib/public-origin.js';
import { getEnterpriseLicenseBounds, getEnterprisePriceId } from './_lib/enterprise-license.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' as any });
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ACTIVE_LICENSE_STATUSES = new Set(['active', 'trialing', 'past_due']);

interface OrgAdminContext {
  organizationId: string;
  email?: string;
  stripeCustomerId?: string;
  hasActiveLicenseSubscription: boolean;
}

/** Resolve the logged-in user's org admin context, if any. */
async function resolveOrgAdmin(authHeader: string | undefined): Promise<OrgAdminContext | null> {
  if (!authHeader?.toLowerCase().startsWith('bearer ')) return null;
  const { data: userData } = await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
  const user = userData?.user;
  if (!user) return null;

  const { data: adminRow } = await supabase
    .from('organization_admins')
    .select('organization_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!adminRow?.organization_id) return null;

  const { data: org } = await supabase
    .from('organizations')
    .select('id, stripe_customer_id, license_subscription_id, license_subscription_status')
    .eq('id', adminRow.organization_id)
    .maybeSingle();
  if (!org) return null;

  return {
    organizationId: org.id,
    email: user.email || undefined,
    stripeCustomerId: (org as any).stripe_customer_id || undefined,
    hasActiveLicenseSubscription: Boolean(
      (org as any).license_subscription_id &&
        ACTIVE_LICENSE_STATUSES.has(String((org as any).license_subscription_status))
    ),
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { licenseCount, companyName, locale, audience } = (req.body || {}) as {
      licenseCount?: number;
      companyName?: string;
      locale?: string;
      audience?: CheckoutAudience;
    };

    const { minLicenses, maxSelfServe } = getEnterpriseLicenseBounds();
    const count = Math.floor(Number(licenseCount));
    if (!Number.isFinite(count) || count < minLicenses || count > maxSelfServe) {
      return res.status(400).json({
        error: `License count must be between ${minLicenses} and ${maxSelfServe}. For larger volumes contact us.`,
      });
    }

    const priceId = getEnterprisePriceId();
    if (!priceId) {
      console.error('[create-enterprise-checkout] STRIPE_ENTERPRISE_PRICE_ID is not set');
      return res.status(500).json({ error: 'Enterprise checkout is not configured - contact support' });
    }

    const orgAdmin = await resolveOrgAdmin(req.headers.authorization);

    const trimmedCompanyName = String(companyName || '').trim();
    if (!orgAdmin && !trimmedCompanyName) {
      return res.status(400).json({ error: 'Company name is required', code: 'COMPANY_NAME_REQUIRED' });
    }
    if (orgAdmin?.hasActiveLicenseSubscription) {
      return res.status(409).json({
        error: 'Your organization already has an active license subscription. Manage licenses via the billing portal.',
        code: 'HAS_ACTIVE_LICENSE_SUBSCRIPTION',
      });
    }

    const appOrigin = publicOriginFromRequest(req);
    const checkoutAudience: CheckoutAudience = audience === 'schools' ? 'schools' : 'tutor';
    const localeCode = typeof locale === 'string' && locale.trim() ? locale.trim() : undefined;

    const successPath = buildPublicPath('/enterprise/success', localeCode, checkoutAudience, appOrigin);
    const cancelPath = buildPublicPath('/pricing', localeCode, checkoutAudience, appOrigin);
    const flow = orgAdmin ? 'org' : 'new';
    const successUrl = `${appOrigin}${successPath}?session_id={CHECKOUT_SESSION_ID}&flow=${flow}`;
    const cancelUrl = `${appOrigin}${cancelPath}?canceled=1`;

    const metadata: Record<string, string> = {
      tutlio_enterprise: '1',
      license_count: String(count),
      app_origin: appOrigin,
      ...(localeCode ? { ui_locale: localeCode } : {}),
      ...(orgAdmin
        ? { organization_id: orgAdmin.organizationId }
        : { company_name: trimmedCompanyName }),
    };

    const checkoutLocale = localeCode === 'en' ? 'en' : localeCode === 'pl' ? 'pl' : 'lt';

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      payment_method_types: ['card', 'link', 'revolut_pay'],
      line_items: [
        {
          price: priceId,
          quantity: count,
          // Buyers can fine-tune the license count on the Stripe page; the
          // webhook reads the final quantity from the subscription.
          adjustable_quantity: { enabled: true, minimum: minLicenses, maximum: maxSelfServe },
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      locale: checkoutLocale,
      allow_promotion_codes: true,
      metadata,
      subscription_data: { metadata },
      ...(orgAdmin?.stripeCustomerId
        ? { customer: orgAdmin.stripeCustomerId }
        : orgAdmin?.email
          ? { customer_email: orgAdmin.email }
          : {}),
    };

    const session = await stripe.checkout.sessions.create(sessionParams);
    return res.status(200).json({ url: session.url });
  } catch (error: any) {
    console.error('[create-enterprise-checkout] Error:', error?.message || error);
    return res.status(500).json({ error: error.message || 'Failed to create checkout session' });
  }
}
