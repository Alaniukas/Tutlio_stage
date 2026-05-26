import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { defaultLocaleForOrigin, publicOriginFromRequest } from './_lib/public-origin.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' as any });
const DEFAULT_SUBSCRIPTION_ONLY_PRODUCT_ID = 'prod_UOWf5Nqxf1wPIg';
const DEFAULT_YEARLY_PRODUCT_ID = 'prod_U9DYSN7YFtsyBI';

type CheckoutAudience = 'tutor' | 'schools';

function buildPublicPath(
  pathname: string,
  locale: string | undefined,
  audience: CheckoutAudience,
  appOrigin: string,
): string {
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const platformPrefix = audience === 'schools' ? '/schools' : '';
  const defaultLocale = defaultLocaleForOrigin(appOrigin);
  const localeSeg = locale && locale !== defaultLocale ? `/${locale}` : '';
  return `${platformPrefix}${localeSeg}${normalized}`;
}
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function resolveYearlyPriceId(stripeClient: Stripe): Promise<string | undefined> {
  if (process.env.STRIPE_YEARLY_PRICE_ID) {
    return process.env.STRIPE_YEARLY_PRICE_ID;
  }

  const productIds = [
    process.env.STRIPE_YEARLY_PRODUCT_ID,
    DEFAULT_YEARLY_PRODUCT_ID,
    process.env.STRIPE_MONTHLY_PRODUCT_ID,
  ].filter(Boolean) as string[];
  const uniqueProductIds = [...new Set(productIds)];

  const monthlyPriceId = process.env.STRIPE_MONTHLY_PRICE_ID;
  if (monthlyPriceId) {
    try {
      const monthly = await stripeClient.prices.retrieve(monthlyPriceId);
      const product = typeof monthly.product === 'string' ? monthly.product : monthly.product?.id;
      if (product && !uniqueProductIds.includes(product)) uniqueProductIds.push(product);
    } catch {
      /* ignore */
    }
  }

  for (const productId of uniqueProductIds) {
    const prices = await stripeClient.prices.list({ product: productId, active: true, limit: 20 });
    const yearlyRecurring = prices.data.find(
      (p) => p.type === 'recurring' && p.recurring?.interval === 'year',
    );
    if (yearlyRecurring?.id) return yearlyRecurring.id;
    const oneTime = prices.data.find((p) => p.type === 'one_time');
    if (oneTime?.id) return oneTime.id;
  }

  return undefined;
}

const TRIAL_CODES = ['TRIAL7D', 'TRIAL', 'BANDYMAS'] as const;
const TRIAL_PERIOD_DAYS = 7;

function isTrialCode(code?: string): boolean {
  if (!code?.trim()) return false;
  return TRIAL_CODES.includes(code.trim().toUpperCase() as (typeof TRIAL_CODES)[number]);
}

async function assertTrialEligible(
  authHeader: string | undefined,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!authHeader) {
    return { ok: false, status: 401, error: 'You must be logged in to use the free trial.' };
  }
  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace(/^Bearer\s+/i, ''),
  );
  if (authError || !user) {
    return { ok: false, status: 401, error: 'Neautorizuota' };
  }
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('trial_used')
    .eq('id', user.id)
    .single();
  if (!profileErr && profile?.trial_used) {
    return {
      ok: false,
      status: 400,
      error:
        'Free trial has already been used with this account. You can subscribe without trial or use a different account.',
    };
  }
  return { ok: true };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { plan, couponCode, startTrial, successRedirect, locale, audience } = req.body as {
      plan: 'monthly' | 'yearly' | 'subscription_only';
      couponCode?: string;
      /** 7-day trial via Stripe subscription_data.trial_period_days — no Dashboard promotion code needed */
      startTrial?: boolean;
      successRedirect?: 'dashboard' | 'register' | 'registration';
      locale?: string;
      audience?: CheckoutAudience;
    };

    const wantsTrial = startTrial === true || isTrialCode(couponCode);

    if (!plan || !['monthly', 'yearly', 'subscription_only'].includes(plan)) {
      return res.status(400).json({ error: 'Neteisingas planas' });
    }

    const appOrigin = publicOriginFromRequest(req);
    const checkoutAudience: CheckoutAudience = audience === 'schools' ? 'schools' : 'tutor';
    const localeCode = typeof locale === 'string' && locale.trim() ? locale.trim() : undefined;
    const pricingPath = buildPublicPath('/pricing', localeCode, checkoutAudience, appOrigin);
    const cancelUrl = `${appOrigin}${pricingPath}?canceled=1`;

    const toDashboard = successRedirect === 'dashboard';
    const toRegistration = successRedirect === 'registration';
    const successUrl = toRegistration
      ? `${appOrigin}/registration/subscription?subscription_success=1&session_id={CHECKOUT_SESSION_ID}`
      : toDashboard
        ? `${appOrigin}/dashboard?subscription_success=1&session_id={CHECKOUT_SESSION_ID}`
        : checkoutAudience === 'schools'
          ? `${appOrigin}${buildPublicPath('/login', localeCode, 'schools', appOrigin)}?subscription_success=1&session_id={CHECKOUT_SESSION_ID}`
          : `${appOrigin}/register?subscription_success=true&session_id={CHECKOUT_SESSION_ID}`;

    // For authenticated users – reuse the same Stripe customer so re-subscribe stays on the same account
    let customerEmail: string | undefined;
    let existingCustomerId: string | undefined;
    if ((toDashboard || toRegistration) && req.headers.authorization) {
      const { data: { user } } = await supabase.auth.getUser(req.headers.authorization.replace('Bearer ', ''));
      if (user) {
        if (user.email) customerEmail = user.email;
        const { data: profile } = await supabase.from('profiles').select('stripe_customer_id').eq('id', user.id).single();
        if (profile?.stripe_customer_id) existingCustomerId = profile.stripe_customer_id;
      }
    }

    let priceId = plan === 'subscription_only'
      ? process.env.STRIPE_SUBSCRIPTION_ONLY_PRICE_ID
      : plan === 'monthly'
        ? process.env.STRIPE_MONTHLY_PRICE_ID
        : process.env.STRIPE_YEARLY_PRICE_ID;

    if (!priceId && plan === 'subscription_only') {
      const productId = process.env.STRIPE_SUBSCRIPTION_ONLY_PRODUCT_ID || DEFAULT_SUBSCRIPTION_ONLY_PRODUCT_ID;
      const prices = await stripe.prices.list({
        product: productId,
        active: true,
        limit: 20,
      });
      const recurringMonthly = prices.data.find((p) => p.type === 'recurring' && p.recurring?.interval === 'month');
      if (recurringMonthly?.id) {
        priceId = recurringMonthly.id;
      }
    }

    if (!priceId && plan === 'yearly') {
      priceId = await resolveYearlyPriceId(stripe);
    }

    if (!priceId) {
      console.error(`Missing price ID for plan: ${plan}`);
      const message =
        plan === 'yearly'
          ? 'Metinis planas Stripe nėra sukonfigūruotas. Nustatykite STRIPE_YEARLY_PRICE_ID.'
          : 'Configuration error - contact support';
      return res.status(500).json({ error: message });
    }

    const price = await stripe.prices.retrieve(priceId);

    // Legacy yearly: one-time payment for 12 months. New yearly product uses recurring (interval: year).
    if (plan === 'yearly' && price.type === 'one_time') {
      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: 'payment',
        payment_method_types: ['card', 'link', 'revolut_pay'],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: { plan: 'yearly' },
        allow_promotion_codes: true,
        locale: 'lt',
        ...(existingCustomerId ? { customer: existingCustomerId } : customerEmail ? { customer_email: customerEmail } : {}),
      };
      if (couponCode) {
        try {
          const promotionCodes = await stripe.promotionCodes.list({ code: couponCode, active: true, limit: 1 });
          if (promotionCodes.data.length > 0) {
            sessionParams.discounts = [{ promotion_code: promotionCodes.data[0].id }];
          } else {
            const coupons = await stripe.coupons.list({ limit: 100 });
            const matchingCoupon = coupons.data.find(c => c.id === couponCode || c.name === couponCode);
            if (matchingCoupon) sessionParams.discounts = [{ coupon: matchingCoupon.id }];
          }
        } catch (err) {
          console.error('Error applying coupon:', err);
          return res.status(400).json({ error: 'Nepavyko pritaikyti nuolaidos kodo' });
        }
      }
      const session = await stripe.checkout.sessions.create(sessionParams);
      return res.status(200).json({ url: session.url });
    }

    if (price.type !== 'recurring' || !price.recurring) {
      console.error(`Price ${priceId} is not recurring (type: ${price.type})`);
      return res.status(500).json({
        error: plan === 'yearly'
          ? 'Metinis planas: Stripe kaina turi būti periodinė (year). Patikrinkite STRIPE_YEARLY_PRICE_ID.'
          : 'Monthly plan: Stripe price must be Recurring. Update STRIPE_MONTHLY_PRICE_ID in .env.',
      });
    }

    const checkoutLocale =
      localeCode === 'en' ? 'en'
        : localeCode === 'pl' ? 'pl'
          : 'lt';

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      payment_method_types: ['card', 'link', 'revolut_pay'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      locale: checkoutLocale,
      ...(existingCustomerId ? { customer: existingCustomerId } : customerEmail ? { customer_email: customerEmail } : {}),
    };

    if (wantsTrial) {
      if (plan !== 'monthly') {
        return res.status(400).json({
          error: '7-day free trial is only available for the monthly plan.',
        });
      }
      const trialCheck = await assertTrialEligible(req.headers.authorization);
      if (!trialCheck.ok) {
        return res.status(trialCheck.status).json({ error: trialCheck.error });
      }
      // Stripe native trial — no promotion code in Dashboard required
      sessionParams.subscription_data = {
        trial_period_days: TRIAL_PERIOD_DAYS,
        metadata: { tutlio_trial_days: String(TRIAL_PERIOD_DAYS) },
      };
      sessionParams.payment_method_collection = 'always';
      sessionParams.metadata = { ...(sessionParams.metadata || {}), tutlio_trial: '7d' };
    } else if (couponCode?.trim()) {
      try {
        const code = couponCode.trim();
        const promotionCodes = await stripe.promotionCodes.list({ code, active: true, limit: 1 });
        if (promotionCodes.data.length > 0) {
          sessionParams.discounts = [{ promotion_code: promotionCodes.data[0].id }];
        } else {
          const coupons = await stripe.coupons.list({ limit: 100 });
          const matchingCoupon = coupons.data.find((c) => c.id === code || c.name === code);
          if (matchingCoupon) sessionParams.discounts = [{ coupon: matchingCoupon.id }];
          else return res.status(400).json({ error: 'Nuolaidos kodas nerastas arba nebegalioja' });
        }
      } catch (err) {
        console.error('Error applying coupon:', err);
        return res.status(400).json({ error: 'Nepavyko pritaikyti nuolaidos kodo' });
      }
    } else {
      sessionParams.allow_promotion_codes = true;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    res.status(200).json({
      url: session.url,
      trialApplied: wantsTrial,
      trialDays: wantsTrial ? TRIAL_PERIOD_DAYS : 0,
    });
  } catch (error: any) {
    console.error('Error creating subscription checkout:', error);
    res.status(500).json({ error: error.message || 'Failed to create checkout session' });
  }
}
