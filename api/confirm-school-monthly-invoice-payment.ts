// POST /api/confirm-school-monthly-invoice-payment { invoiceId, sessionId }
// Called by /school-payment-success after Stripe redirects back. Verifies the
// Checkout Session with Stripe and marks the monthly extra-lessons invoice paid
// (idempotent — the webhook may already have done it).
import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { markSchoolMonthlyInvoicePaid } from './_lib/schoolMonthlyInvoiceEmail.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!stripeKey || !supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const checkoutSessionId = String(req.body?.sessionId || '').trim();
  const invoiceId = String(req.body?.invoiceId || '').trim();
  if (!checkoutSessionId || !invoiceId) {
    return res.status(400).json({ error: 'Missing sessionId or invoiceId' });
  }

  try {
    const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' as any });
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);
    if (!session || session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Checkout session not paid' });
    }
    const metaInvoiceId = String(session.metadata?.tutlio_school_monthly_invoice_id || '').trim();
    if (!metaInvoiceId || metaInvoiceId !== invoiceId) {
      return res.status(400).json({ error: 'Checkout session does not belong to this invoice' });
    }

    const result = await markSchoolMonthlyInvoicePaid(supabase, invoiceId, {
      paidVia: 'stripe',
      stripePaymentIntentId: typeof (session as any).payment_intent === 'string' ? (session as any).payment_intent : null,
    });
    if (result.ok === false) {
      return res.status(result.error === 'Invoice not found' ? 404 : 500).json({ error: result.error });
    }
    return res.status(200).json({ success: true, invoiceId, alreadyPaid: result.alreadyPaid });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Failed to confirm school monthly invoice payment' });
  }
}
