import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { markSchoolInstallmentPaidAndMaybeInvite } from './_lib/schoolBookingInvite.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!stripeKey || !supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const checkoutSessionId = String(req.body?.sessionId || '').trim();
  const installmentId = String(req.body?.installmentId || '').trim();
  if (!checkoutSessionId || !installmentId) {
    return res.status(400).json({ error: 'Missing sessionId or installmentId' });
  }

  try {
    const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' as any });
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);
    if (!session || session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Checkout session not paid' });
    }

    const metaInstallmentId = String(session.metadata?.tutlio_school_installment_id || '').trim();
    let resolvedInstallmentId = installmentId;
    if (metaInstallmentId) {
      if (metaInstallmentId !== installmentId) {
        const { data: byBodyInstallment } = await supabase
          .from('school_payment_installments')
          .select('id, stripe_checkout_session_id')
          .eq('id', installmentId)
          .maybeSingle();

        // Legacy safety: allow body installment when it is already bound to this checkout session.
        if (byBodyInstallment?.stripe_checkout_session_id === checkoutSessionId) {
          resolvedInstallmentId = installmentId;
        } else {
          resolvedInstallmentId = metaInstallmentId;
        }
      } else {
        resolvedInstallmentId = metaInstallmentId;
      }
    }

    const result = await markSchoolInstallmentPaidAndMaybeInvite(supabase, resolvedInstallmentId, {
      serviceRoleKey,
      stripePaymentIntentId: (session as any).payment_intent || null,
      studentId: String(session.metadata?.tutlio_student_id || '').trim() || null,
    });

    if (!result.success) {
      return res.status(result.error === 'Installment not found' ? 404 : 500).json({ error: result.error });
    }

    return res.status(200).json({ success: true, installmentId: resolvedInstallmentId });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Failed to confirm school installment payment' });
  }
}
