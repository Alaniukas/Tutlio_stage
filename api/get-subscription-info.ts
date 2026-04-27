import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' as any });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID reikalingas' });
    }

    // Retrieve the checkout session
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Yearly plan: one-time payment (mode: payment), 12 months access from payment date
    if (session.mode === 'payment' && session.metadata?.plan === 'yearly' && session.payment_status === 'paid') {
      const periodEnd = new Date((session.created || Math.floor(Date.now() / 1000)) * 1000);
      periodEnd.setMonth(periodEnd.getMonth() + 12);
      return res.status(200).json({
        customerId: session.customer,
        subscriptionId: `yearly_${session.id}`,
        status: 'active',
        plan: 'yearly',
        currentPeriodEnd: periodEnd.toISOString(),
      });
    }

    if (!session.subscription) {
      return res.status(400).json({ error: 'Nerasta subscription sesijoje' });
    }

    const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
    const subOnlyPriceId = process.env.STRIPE_SUBSCRIPTION_ONLY_PRICE_ID;
    const firstPriceId = subscription.items.data[0]?.price?.id;
    const plan =
      firstPriceId && subOnlyPriceId && firstPriceId === subOnlyPriceId
        ? 'subscription_only'
        : subscription.items.data[0]?.price.recurring?.interval === 'year'
          ? 'yearly'
          : 'monthly';

    res.status(200).json({
      customerId: session.customer,
      subscriptionId: subscription.id,
      status: subscription.status,
      plan,
      currentPeriodEnd: new Date((subscription as unknown as { current_period_end: number }).current_period_end * 1000).toISOString(),
    });
  } catch (error: any) {
    console.error('Error fetching subscription info:', error);
    res.status(500).json({ error: error.message || 'Nepavyko gauti subscription informacijos' });
  }
}
