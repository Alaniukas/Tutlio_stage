import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' as any });
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getPriceInfo(sub: Stripe.Subscription) {
  const item = sub.items.data[0];
  const unitAmount = item?.price?.unit_amount;
  const currency = item?.price?.currency || 'eur';
  const interval = item?.price?.recurring?.interval || null;
  return {
    subscription_price_amount: typeof unitAmount === 'number' ? unitAmount / 100 : null,
    subscription_price_currency: currency,
    subscription_price_interval: interval,
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Neautorizuota' });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user?.email) {
      return res.status(401).json({ error: 'Neautorizuota' });
    }

    const profileId = user.id;
    const email = user.email;

    // Fetch profile (possibly with stripe_customer_id)
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, full_name')
      .eq('id', profileId)
      .single();

    let customerId = profile?.stripe_customer_id as string | null;

    // Validate stored Stripe customer. Recover if stale/missing/deleted.
    if (customerId) {
      try {
        const customer = await stripe.customers.retrieve(customerId);
        if ((customer as any)?.deleted === true) {
          customerId = null;
        }
      } catch (e: any) {
        const code = e?.code || e?.raw?.code;
        if (code === 'resource_missing') {
          customerId = null;
        } else {
          throw e;
        }
      }
    }

    if (!customerId) {
      const customers = await stripe.customers.list({ email, limit: 1 });
      customerId = customers.data[0]?.id || null;
    }

    if (!customerId) {
      // Create a customer so future flows can proceed (portal/checkout linking).
      const created = await stripe.customers.create({
        email,
        name: (profile as any)?.full_name || undefined,
        metadata: { tutlio_user_id: profileId },
      });
      customerId = created.id;
    }

    // Persist recovered/created customer id to profile if changed
    if (customerId && customerId !== profile?.stripe_customer_id) {
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', profileId);
    }

    // Look for yearly one-time payment (checkout session)
    const sessions = await stripe.checkout.sessions.list({
      customer: customerId,
      limit: 20,
    });

    const yearlySession = sessions.data.find(
      (s) => s.mode === 'payment' && s.metadata?.plan === 'yearly' && s.payment_status === 'paid'
    );

    if (yearlySession) {
      const periodEnd = new Date((yearlySession.created || 0) * 1000);
      periodEnd.setMonth(periodEnd.getMonth() + 12);

      await supabase
        .from('profiles')
        .update({
          stripe_customer_id: customerId,
          stripe_subscription_id: `yearly_${yearlySession.id}`,
          subscription_status: 'active',
          subscription_plan: 'yearly',
          subscription_current_period_end: periodEnd.toISOString(),
        })
        .eq('id', profileId);

      return res.status(200).json({
        success: true,
        subscription_status: 'active',
        subscription_plan: 'yearly',
        subscription_current_period_end: periodEnd.toISOString(),
        subscription_price_amount: typeof yearlySession.amount_total === 'number' ? yearlySession.amount_total / 100 : null,
        subscription_price_currency: yearlySession.currency || 'eur',
        subscription_price_interval: 'year',
      });
    }

    // Look for recurring subscription – take the LATEST active one (on resubscribe there can be multiple, old one canceled)
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 10,
    });

    const activeOrTrialing = subscriptions.data
      .filter((s) => s.status === 'active' || s.status === 'trialing')
      .sort((a, b) => (b.created || 0) - (a.created || 0));
    const active = activeOrTrialing[0] ?? null;

    const statusForDisplay = (sub: Stripe.Subscription) =>
      sub.status === 'canceled' || (sub as any).cancel_at_period_end ? 'canceled' : sub.status;

    if (active) {
      const subOnlyPriceId = process.env.STRIPE_SUBSCRIPTION_ONLY_PRICE_ID;
      const firstPriceId = active.items.data[0]?.price?.id;
      const plan =
        firstPriceId && subOnlyPriceId && firstPriceId === subOnlyPriceId
          ? 'subscription_only'
          : active.items.data[0]?.price.recurring?.interval === 'year'
            ? 'yearly'
            : 'monthly';
      const periodEnd = new Date((active as Stripe.Subscription & { current_period_end: number }).current_period_end * 1000).toISOString();
      const statusToSave = statusForDisplay(active);
      const priceInfo = getPriceInfo(active);

      await supabase
        .from('profiles')
        .update({
          stripe_customer_id: customerId,
          stripe_subscription_id: active.id,
          subscription_status: statusToSave,
          subscription_plan: plan,
          subscription_current_period_end: periodEnd,
        })
        .eq('id', profileId);

      return res.status(200).json({
        success: true,
        subscription_status: statusToSave,
        subscription_plan: plan,
        subscription_current_period_end: periodEnd,
        ...priceInfo,
      });
    }

    // Cancelled or other status – update profile so Settings shows 'Cancelled' and expiry date
    const latest = subscriptions.data[0];
    if (latest) {
      const subOnlyPriceId = process.env.STRIPE_SUBSCRIPTION_ONLY_PRICE_ID;
      const firstPriceId = latest.items.data[0]?.price?.id;
      const plan =
        firstPriceId && subOnlyPriceId && firstPriceId === subOnlyPriceId
          ? 'subscription_only'
          : latest.items.data[0]?.price.recurring?.interval === 'year'
            ? 'yearly'
            : 'monthly';
      const periodEnd = new Date((latest as Stripe.Subscription & { current_period_end: number }).current_period_end * 1000).toISOString();
      const statusToSave = statusForDisplay(latest);
      const priceInfo = getPriceInfo(latest);

      await supabase
        .from('profiles')
        .update({
          stripe_customer_id: customerId,
          stripe_subscription_id: latest.id,
          subscription_status: statusToSave,
          subscription_plan: plan,
          subscription_current_period_end: periodEnd,
        })
        .eq('id', profileId);

      return res.status(200).json({
        success: true,
        subscription_status: statusToSave,
        subscription_plan: plan,
        subscription_current_period_end: periodEnd,
        ...priceInfo,
      });
    }

    return res.status(404).json({ error: 'No active subscription or yearly payment found for this email in Stripe.' });
  } catch (error: any) {
    console.error('refresh-my-subscription error:', error);
    return res.status(500).json({ error: error.message || 'Nepavyko atnaujinti prenumeratos' });
  }
}
