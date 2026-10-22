import Stripe from 'stripe';
import type { VercelRequest, VercelResponse } from './types.js';
import { requireOrgAdminAccess } from './_lib/orgAdminAccess.js';
import { serviceSupabase } from './_lib/schoolConsultationsAccess.js';
import { expireConnectCheckoutSession, retrieveConnectCheckoutSessionWithScope } from './_lib/stripeDirectCharge.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const db = serviceSupabase();
    const access = await requireOrgAdminAccess(req, db, 'finance.edit');
    if (access.ok === false) return res.status(access.status).json({ error: access.error });
    const { organizationId, userId } = access.access;
    const invoiceId = String(req.body?.invoiceId || '').trim();
    const reason = String(req.body?.reason || '').trim();
    if (!UUID.test(invoiceId) || reason.length < 3 || reason.length > 1000) {
      return res.status(400).json({ error: 'Pasirinkite sąskaitą ir nurodykite 3–1000 simbolių panaikinimo priežastį.' });
    }

    // Historical documents must remain manageable even if new billing is disabled.
    const { data: invoice, error: loadError } = await db.from('school_monthly_invoices')
      .select('id, payment_status, cancellation_reason, paid_at, stripe_payment_intent_id, stripe_checkout_session_id, org:organizations!inner(entity_type,stripe_account_id)')
      .eq('id', invoiceId).eq('organization_id', organizationId).eq('org.entity_type', 'school').maybeSingle();
    if (loadError) throw loadError;
    if (!invoice) return res.status(404).json({ error: 'Sąskaita nerasta.' });
    if (invoice.payment_status === 'cancelled') {
      return res.status(200).json({ success: true, invoiceId, alreadyCancelled: true, cancellationReason: invoice.cancellation_reason || null });
    }
    if (invoice.payment_status !== 'pending' || invoice.paid_at || invoice.stripe_payment_intent_id) {
      return res.status(409).json({ error: 'Apmokėtos sąskaitos panaikinti negalima.' });
    }

    const checkoutId = invoice.stripe_checkout_session_id;
    if (checkoutId) {
      if (!process.env.STRIPE_SECRET_KEY) throw new Error('Stripe is unavailable');
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2026-02-25.clover' as any });
      const org = Array.isArray(invoice.org) ? invoice.org[0] : invoice.org;
      const lookup = await retrieveConnectCheckoutSessionWithScope(stripe, checkoutId, org?.stripe_account_id);
      const session = lookup.session;
      if (session.metadata?.tutlio_school_monthly_invoice_id !== invoiceId
        || session.payment_status === 'paid' || session.status === 'complete') {
        return res.status(409).json({ error: 'Sąskaitos mokėjimas pasikeitė. Atnaujinkite sąrašą ir patikrinkite mokėjimą.' });
      }
      if (session.status === 'open') {
        // Expiration must succeed before cancellation; it also closes the race with payment.
        const expired = await expireConnectCheckoutSession(stripe, checkoutId, lookup.stripeAccount);
        if (expired.status !== 'expired') throw new Error('Checkout expiration was not confirmed');
      } else if (session.status !== 'expired') {
        throw new Error('Unknown checkout state');
      }
    }

    // One atomic write retains the number, PDF and source lines. The existing
    // overpayment trigger releases any reserved credit in the same transaction.
    let update = db.from('school_monthly_invoices').update({
      payment_status: 'cancelled', cancelled_at: new Date().toISOString(),
      cancelled_by: userId, cancellation_reason: reason,
    }).eq('id', invoiceId).eq('organization_id', organizationId)
      .eq('payment_status', 'pending').is('paid_at', null).is('stripe_payment_intent_id', null);
    update = checkoutId ? update.eq('stripe_checkout_session_id', checkoutId) : update.is('stripe_checkout_session_id', null);
    const saved = await update.select('id').maybeSingle();
    if (saved.error) throw saved.error;
    if (!saved.data) return res.status(409).json({ error: 'Sąskaita pasikeitė. Atnaujinkite sąrašą ir bandykite dar kartą.' });
    return res.status(200).json({ success: true, invoiceId, cancellationReason: reason });
  } catch (cause) {
    console.error('[cancel-school-monthly-invoice]', cause);
    return res.status(503).json({ error: 'Nepavyko panaikinti sąskaitos. Bandykite dar kartą.' });
  }
}
