import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' as any });
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:3000';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Neautorizuota' });
    }

    // Get user from Supabase auth
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return res.status(401).json({ error: 'Neautorizuota' });
    }

    // Get user's profile with stripe_customer_id
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('stripe_customer_id, full_name')
      .eq('id', user.id)
      .single();

    if (profileError) {
      return res.status(400).json({ error: 'Nerastas vartotojo profilis' });
    }

    let customerId = profile?.stripe_customer_id || null;

    // 1) If profile has customer id, verify it exists in Stripe
    if (customerId) {
      try {
        const existing = await stripe.customers.retrieve(customerId);
        if ((existing as any)?.deleted === true) {
          console.warn('[customer-portal] Stored stripe_customer_id is deleted in Stripe. Will recover by email.');
          customerId = null;
        }
      } catch (e: any) {
        // Stale customer ID in DB, recover below
        const code = e?.code || e?.raw?.code;
        if (code === 'resource_missing') {
          console.warn('[customer-portal] Stored stripe_customer_id missing in Stripe. Will recover by email.');
          customerId = null;
        } else {
          throw e;
        }
      }
    }

    // 2) Recover by user email
    if (!customerId && user.email) {
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      customerId = customers.data[0]?.id || null;
    }

    // 3) If still none, create a fresh customer
    if (!customerId) {
      const created = await stripe.customers.create({
        email: user.email || undefined,
        name: (profile as any)?.full_name || undefined,
        metadata: { tutlio_user_id: user.id },
      });
      customerId = created.id;
    }

    // Persist recovered/created customer id to profile
    if (customerId && customerId !== profile?.stripe_customer_id) {
      await supabase
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user.id);
    }

    // Create customer portal session – after cancellation/actions user returns to Settings
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${APP_URL}/settings?from=stripe_portal`,
    });

    res.status(200).json({ url: session.url });
  } catch (error: any) {
    console.error('Error creating customer portal session:', error);
    res.status(500).json({ error: error.message || 'Nepavyko sukurti portalo sesijos' });
  }
}
