import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' as any });
const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:3000';
const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { plan, couponCode, successRedirect } = req.body as {
      plan: 'monthly' | 'yearly';
      couponCode?: string;
      successRedirect?: 'dashboard' | 'register';
    };

    if (!plan || !['monthly', 'yearly'].includes(plan)) {
      return res.status(400).json({ error: 'Neteisingas planas' });
    }

    const toDashboard = successRedirect === 'dashboard';
    const successUrl = toDashboard
      ? `${APP_URL}/dashboard?subscription_success=1&session_id={CHECKOUT_SESSION_ID}`
      : `${APP_URL}/register?subscription_success=true&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = toDashboard
      ? `${APP_URL}/registration/subscription?canceled=1`
      : `${APP_URL}/tutor-subscribe?canceled=true`;

    // For authenticated users – reuse the same Stripe customer so re-subscribe stays on the same account
    let customerEmail: string | undefined;
    let existingCustomerId: string | undefined;
    if (toDashboard && req.headers.authorization) {
      const { data: { user } } = await supabase.auth.getUser(req.headers.authorization.replace('Bearer ', ''));
      if (user) {
        if (user.email) customerEmail = user.email;
        const { data: profile } = await supabase.from('profiles').select('stripe_customer_id').eq('id', user.id).single();
        if (profile?.stripe_customer_id) existingCustomerId = profile.stripe_customer_id;
      }
    }

    // Get the correct price ID from environment variables
    // You'll need to set these in Vercel after creating products in Stripe
    const priceId = plan === 'monthly'
      ? process.env.STRIPE_MONTHLY_PRICE_ID
      : process.env.STRIPE_YEARLY_PRICE_ID;

    if (!priceId) {
      console.error(`Missing price ID for plan: ${plan}`);
      return res.status(500).json({ error: 'Configuration error - contact support' });
    }

    // Yearly = one-time payment, 12 months access. Monthly = recurring subscription.
    const isYearlyOneTime = plan === 'yearly';

    if (isYearlyOneTime) {
      // Yearly: one-time payment (mode: 'payment'), price must be One-time in Stripe
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

    // Monthly: recurring subscription – price must be Recurring
    const price = await stripe.prices.retrieve(priceId);
    if (price.type !== 'recurring' || !price.recurring) {
      console.error(`Price ${priceId} is not recurring (type: ${price.type})`);
      return res.status(500).json({
        error: 'Monthly plan: Stripe price must be Recurring. Update STRIPE_MONTHLY_PRICE_ID in .env.',
      });
    }

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'subscription',
      payment_method_types: ['card', 'link', 'revolut_pay'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      locale: 'lt',
      ...(existingCustomerId ? { customer: existingCustomerId } : customerEmail ? { customer_email: customerEmail } : {}),
    };

    if (couponCode) {
      const trialCodes = ['TRIAL7D', 'TRIAL', 'BANDYMAS'];
      if (trialCodes.includes(couponCode.toUpperCase())) {
        // Vienas nemokamas trial vienai paskyrai – reikia prisijungimo ir tikriname trial_used
        const authHeader = req.headers.authorization;
        if (!authHeader) {
          return res.status(401).json({ error: 'You must be logged in to use the free trial.' });
        }
        const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
        if (authError || !user) {
          return res.status(401).json({ error: 'Neautorizuota' });
        }
        const { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .select('trial_used')
          .eq('id', user.id)
          .single();
        if (!profileErr && profile?.trial_used) {
          return res.status(400).json({
            error: 'Free trial has already been used with this account. You can subscribe without trial or use a different account.',
          });
        }
        sessionParams.subscription_data = { trial_period_days: 7 };
      } else {
        try {
          const promotionCodes = await stripe.promotionCodes.list({ code: couponCode, active: true, limit: 1 });
          if (promotionCodes.data.length > 0) {
            sessionParams.discounts = [{ promotion_code: promotionCodes.data[0].id }];
          } else {
            const coupons = await stripe.coupons.list({ limit: 100 });
            const matchingCoupon = coupons.data.find(c => c.id === couponCode || c.name === couponCode);
            if (matchingCoupon) sessionParams.discounts = [{ coupon: matchingCoupon.id }];
            else return res.status(400).json({ error: 'Nuolaidos kodas nerastas arba nebegalioja' });
          }
        } catch (err) {
          console.error('Error applying coupon:', err);
          return res.status(400).json({ error: 'Nepavyko pritaikyti nuolaidos kodo' });
        }
      }
    } else {
      sessionParams.allow_promotion_codes = true;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    res.status(200).json({ url: session.url });
  } catch (error: any) {
    console.error('Error creating subscription checkout:', error);
    res.status(500).json({ error: error.message || 'Failed to create checkout session' });
  }
}
