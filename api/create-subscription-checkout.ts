import type { VercelRequest, VercelResponse } from '@vercel/node';
import { stripeCheckoutLocale } from './_lib/stripeLocale.js';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { buildPublicPath, publicOriginFromRequest, type CheckoutAudience } from './_lib/public-origin.js';
import { marketFromRequest } from './_lib/market.js';
import { stripeSubscriptionEnv } from './_lib/stripe-subscription-env.js';
import { isEnterpriseLicensePriceId } from './_lib/enterprise-license.js';
import { subscriptionCurrencyFor } from '../src/lib/localeCurrency.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' as any });
const DEFAULT_SUBSCRIPTION_ONLY_PRODUCT_IDS = {
  default: 'prod_UOWf5Nqxf1wPIg',
  pl: 'prod_UXqgvrOzWvJiM8',
} as const;
const DEFAULT_YEARLY_PRODUCT_ID = 'prod_U9DYSN7YFtsyBI';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function resolveYearlyPriceId(
  stripeClient: Stripe,
  env: ReturnType<typeof stripeSubscriptionEnv>,
): Promise<string | undefined> {
  if (env.yearlyPriceId) {
    return env.yearlyPriceId;
  }

  const productIds = [
    env.yearlyProductId,
    DEFAULT_YEARLY_PRODUCT_ID,
    env.monthlyProductId,
  ].filter(Boolean) as string[];
  const uniqueProductIds = [...new Set(productIds)];

  const monthlyPriceId = env.monthlyPriceId;
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

// Legacy trial promo codes still accepted, but the 7-day trial is now applied
// by default to every individual subscription checkout (no code needed).
const LEGACY_TRIAL_CODES = ['TRIAL7D', 'TRIAL', 'BANDYMAS'] as const;
// Internal trial-extension codes are handled here instead of as Stripe coupons,
// because coupons change price and cannot extend a subscription trial.
const EXTENDED_TRIAL_CODES = ['TRIAL14D'] as const;
const DEFAULT_TRIAL_PERIOD_DAYS = 7;
const EXTENDED_TRIAL_PERIOD_DAYS = 14;
const CHECKOUT_PLANS = ['monthly', 'yearly', 'subscription_only', 'subscription_only_yearly'] as const;
type CheckoutPlan = (typeof CHECKOUT_PLANS)[number];

function trialPeriodDaysForCode(code?: string): number | undefined {
  if (!code?.trim()) return undefined;
  const normalizedCode = code.trim().toUpperCase();
  if (EXTENDED_TRIAL_CODES.includes(normalizedCode as (typeof EXTENDED_TRIAL_CODES)[number])) {
    return EXTENDED_TRIAL_PERIOD_DAYS;
  }
  if (LEGACY_TRIAL_CODES.includes(normalizedCode as (typeof LEGACY_TRIAL_CODES)[number])) {
    return DEFAULT_TRIAL_PERIOD_DAYS;
  }
  return undefined;
}

/**
 * Create the session; when a USD checkout is rejected because the price has no
 * USD currency option yet (`npm run stripe:setup-usd` not run on this account),
 * fall back to the price's own currency rather than blocking the purchase.
 */
async function createCheckoutSession(
  stripeClient: Stripe,
  params: Stripe.Checkout.SessionCreateParams,
): Promise<Stripe.Checkout.Session> {
  try {
    return await stripeClient.checkout.sessions.create(params);
  } catch (error) {
    const message = String((error as { message?: string })?.message || '');
    if (params.currency && /currenc/i.test(message)) {
      console.warn(`Stripe rejected currency=${params.currency}; retrying in the price currency: ${message}`);
      const { currency: _dropped, ...withoutCurrency } = params;
      return stripeClient.checkout.sessions.create(withoutCurrency);
    }
    throw error;
  }
}

function isTrialCode(code?: string): boolean {
  return trialPeriodDaysForCode(code) !== undefined;
}

/** Keep caller-provided Checkout cancellation targets on the current Tutlio origin. */
function safeCheckoutCancelPath(value: unknown, appOrigin: string): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.length > 2048) return null;

  try {
    const resolved = new URL(value, appOrigin);
    if (resolved.origin !== appOrigin) return null;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return null;
  }
}

/** trial_used check for logged-in users; anonymous sign-up checkouts are eligible. */
async function hasUsedTrial(authHeader: string | undefined): Promise<boolean> {
  if (!authHeader) return false;
  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.replace(/^Bearer\s+/i, ''),
  );
  if (authError || !user) return false;
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('trial_used')
    .eq('id', user.id)
    .single();
  return !profileErr && Boolean(profile?.trial_used);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { plan, couponCode, startTrial, successRedirect, locale, audience, uiMode, cancelPath } = req.body as {
      plan: CheckoutPlan;
      couponCode?: string;
      /** Trial is ON by default; pass false to opt out (e.g. resubscribe). */
      startTrial?: boolean;
      successRedirect?: 'dashboard' | 'register' | 'registration';
      locale?: string;
      audience?: CheckoutAudience;
      uiMode?: 'hosted' | 'embedded';
      /** Same-origin page that launched hosted Checkout (for Stripe's back button). */
      cancelPath?: string;
    };

    if (!plan || !CHECKOUT_PLANS.includes(plan)) {
      return res.status(400).json({ error: 'Neteisingas planas' });
    }
    if (uiMode && !['hosted', 'embedded'].includes(uiMode)) {
      return res.status(400).json({ error: 'Neteisingas atsiskaitymo režimas' });
    }

    const requestedEmbedded = uiMode === 'embedded';
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
    const isEmbedded = requestedEmbedded && Boolean(publishableKey);
    if (requestedEmbedded && !publishableKey) {
      console.warn('STRIPE_PUBLISHABLE_KEY missing; falling back to hosted Stripe Checkout');
    }

    // 7-day trial by default for individual plans; TRIAL14D extends it to 14
    // days. Explicit requests (button / trial code) error when the trial was
    // already used; the default application just skips it silently.
    const codeTrialDays = trialPeriodDaysForCode(couponCode);
    const explicitTrial = startTrial === true || codeTrialDays !== undefined;
    let trialDays = 0;
    if (startTrial !== false || codeTrialDays !== undefined) {
      const trialUsed = await hasUsedTrial(req.headers.authorization);
      if (trialUsed && explicitTrial) {
        return res.status(400).json({
          error:
            'Free trial has already been used with this account. You can subscribe without trial or use a different account.',
        });
      }
      if (!trialUsed) {
        trialDays = codeTrialDays ?? DEFAULT_TRIAL_PERIOD_DAYS;
      }
    }
    const wantsTrial = trialDays > 0;

    const appOrigin = publicOriginFromRequest(req);
    const checkoutAudience: CheckoutAudience = audience === 'schools' ? 'schools' : 'tutor';
    const localeCode = typeof locale === 'string' && locale.trim() ? locale.trim() : undefined;
    const pricingPath = buildPublicPath('/pricing', localeCode, checkoutAudience, appOrigin);
    const safeCancelPath = safeCheckoutCancelPath(cancelPath, appOrigin) ?? pricingPath;
    const cancelUrlObject = new URL(safeCancelPath, appOrigin);
    cancelUrlObject.searchParams.set('canceled', '1');
    if (codeTrialDays === EXTENDED_TRIAL_PERIOD_DAYS) {
      cancelUrlObject.searchParams.set('promo', EXTENDED_TRIAL_CODES[0]);
    }
    const cancelUrl = cancelUrlObject.toString();

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

    const market = marketFromRequest(req);
    // Interface languages without a supported local currency pay USD through the
    // multi-currency option on the same EUR price (npm run stripe:setup-usd).
    const checkoutCurrency = subscriptionCurrencyFor(market, localeCode);
    const currencyParams = checkoutCurrency === 'USD' ? { currency: 'usd' as const } : {};
    const stripeEnv = stripeSubscriptionEnv(market);

    const isSubscriptionOnlyPlan = plan === 'subscription_only' || plan === 'subscription_only_yearly';
    const wantsYearlyBilling = plan === 'yearly' || plan === 'subscription_only_yearly';

    let priceId = plan === 'subscription_only_yearly'
      ? stripeEnv.subscriptionOnlyYearlyPriceId
      : plan === 'subscription_only'
        ? stripeEnv.subscriptionOnlyPriceId
      : plan === 'monthly'
        ? stripeEnv.monthlyPriceId
        : stripeEnv.yearlyPriceId;

    let resolvedPrice: Stripe.Price | undefined;
    if (priceId && isSubscriptionOnlyPlan) {
      const candidate = await stripe.prices.retrieve(priceId);
      const candidateProductId = typeof candidate.product === 'string'
        ? candidate.product
        : candidate.product?.id;
      const allowedProductIds = [
        DEFAULT_SUBSCRIPTION_ONLY_PRODUCT_IDS[market],
        stripeEnv.subscriptionOnlyProductId,
      ].filter(Boolean) as string[];

      if (
        isEnterpriseLicensePriceId(priceId) ||
        !candidateProductId ||
        !allowedProductIds.includes(candidateProductId)
      ) {
        console.error(
          `Ignoring misconfigured Stripe price for ${plan}: the price does not belong to an allowed subscription-only product`,
        );
        priceId = undefined;
      } else {
        resolvedPrice = candidate;
      }
    }

    if (!priceId && isSubscriptionOnlyPlan) {
      const productIds = [
        DEFAULT_SUBSCRIPTION_ONLY_PRODUCT_IDS[market],
        stripeEnv.subscriptionOnlyProductId,
      ].filter(Boolean) as string[];

      for (const productId of [...new Set(productIds)]) {
        const prices = await stripe.prices.list({
          product: productId,
          active: true,
          limit: 20,
        });
        const recurringPrice = prices.data.find(
          (candidate) =>
            !isEnterpriseLicensePriceId(candidate.id) &&
            candidate.type === 'recurring' &&
            candidate.recurring?.interval === (wantsYearlyBilling ? 'year' : 'month'),
        );
        if (recurringPrice?.id) {
          priceId = recurringPrice.id;
          resolvedPrice = recurringPrice;
          break;
        }
      }
    }

    if (!priceId && plan === 'yearly') {
      priceId = await resolveYearlyPriceId(stripe, stripeEnv);
    }

    if (!priceId) {
      console.error(`Missing price ID for plan: ${plan} (market: ${market})`);
      const priceEnv =
        market === 'pl'
          ? plan === 'yearly'
            ? 'STRIPE_YEARLY_PRICE_ID_PLN'
            : plan === 'monthly'
              ? 'STRIPE_MONTHLY_PRICE_ID_PLN'
              : plan === 'subscription_only_yearly'
                ? 'STRIPE_SUBSCRIPTION_ONLY_YEARLY_PRICE_ID_PLN'
                : 'STRIPE_SUBSCRIPTION_ONLY_PRICE_ID_PLN'
          : plan === 'yearly'
            ? 'STRIPE_YEARLY_PRICE_ID'
            : plan === 'monthly'
              ? 'STRIPE_MONTHLY_PRICE_ID'
              : plan === 'subscription_only_yearly'
                ? 'STRIPE_SUBSCRIPTION_ONLY_YEARLY_PRICE_ID'
                : 'STRIPE_SUBSCRIPTION_ONLY_PRICE_ID';
      const message =
        plan === 'yearly'
          ? `Metinis planas Stripe nėra sukonfigūruotas. Nustatykite ${priceEnv}.`
          : 'Configuration error - contact support';
      return res.status(500).json({ error: message });
    }

    const price = resolvedPrice ?? await stripe.prices.retrieve(priceId);

    // Legacy yearly: one-time payment for 12 months. New yearly product uses recurring (interval: year).
    if (plan === 'yearly' && price.type === 'one_time') {
      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: 'payment',
        ...currencyParams,
        payment_method_types: isEmbedded ? ['card', 'link'] : ['card', 'link', 'revolut_pay'],
        line_items: [{ price: priceId, quantity: 1 }],
        ...(isEmbedded
          ? { ui_mode: 'embedded' as const, redirect_on_completion: 'never' as const }
          : { success_url: successUrl, cancel_url: cancelUrl }),
        metadata: { plan: 'yearly' },
        allow_promotion_codes: true,
        locale: stripeCheckoutLocale(localeCode),
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
      const session = await createCheckoutSession(stripe, sessionParams);
      if (isEmbedded) {
        if (!session.client_secret) throw new Error('Stripe did not return an Embedded Checkout client secret');
        return res.status(200).json({
          clientSecret: session.client_secret,
          publishableKey,
          completionUrl: successUrl.replace('{CHECKOUT_SESSION_ID}', encodeURIComponent(session.id)),
        });
      }
      return res.status(200).json({ url: session.url });
    }

    if (
      price.type !== 'recurring' ||
      !price.recurring ||
      price.recurring.interval !== (wantsYearlyBilling ? 'year' : 'month')
    ) {
      console.error(`Price ${priceId} is not recurring (type: ${price.type})`);
      return res.status(500).json({
        error: wantsYearlyBilling
          ? 'Yearly plan: Stripe price must be recurring with interval=year.'
          : 'Monthly plan: Stripe price must be recurring with interval=month.',
      });
    }

    const checkoutLocale = stripeCheckoutLocale(localeCode);

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      ...currencyParams,
      payment_method_types: isEmbedded ? ['card', 'link'] : ['card', 'link', 'revolut_pay'],
      line_items: [{ price: priceId, quantity: 1 }],
      ...(isEmbedded
        ? { ui_mode: 'embedded' as const, redirect_on_completion: 'never' as const }
        : { success_url: successUrl, cancel_url: cancelUrl }),
      locale: checkoutLocale,
      metadata: { tutlio_plan: isSubscriptionOnlyPlan ? 'subscription_only' : plan },
      ...(existingCustomerId ? { customer: existingCustomerId } : customerEmail ? { customer_email: customerEmail } : {}),
    };

    if (wantsTrial) {
      // Stripe native trial — no promotion code in Dashboard required
      sessionParams.subscription_data = {
        trial_period_days: trialDays,
        metadata: {
          tutlio_trial_days: String(trialDays),
          tutlio_plan: isSubscriptionOnlyPlan ? 'subscription_only' : plan,
        },
      };
      sessionParams.payment_method_collection = 'always';
      sessionParams.metadata = { ...(sessionParams.metadata || {}), tutlio_trial: `${trialDays}d` };
    }

    // Discount codes combine with the trial (legacy trial codes are not Stripe codes).
    if (couponCode?.trim() && !isTrialCode(couponCode)) {
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

    const session = await createCheckoutSession(stripe, sessionParams);

    if (isEmbedded && !session.client_secret) {
      throw new Error('Stripe did not return an Embedded Checkout client secret');
    }

    res.status(200).json({
      ...(isEmbedded
        ? {
            clientSecret: session.client_secret,
            publishableKey,
            completionUrl: successUrl.replace('{CHECKOUT_SESSION_ID}', encodeURIComponent(session.id)),
          }
        : { url: session.url }),
      trialApplied: wantsTrial,
      trialDays,
    });
  } catch (error: any) {
    console.error('Error creating subscription checkout:', error);
    res.status(500).json({ error: error.message || 'Failed to create checkout session' });
  }
}
