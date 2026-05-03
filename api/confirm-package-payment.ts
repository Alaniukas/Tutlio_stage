import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { syncSessionToGoogle } from './_lib/google-calendar.js';
import { markInvoicesPaidForPackage } from './_lib/markPackageInvoicePaid.js';

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' as any });
}

function getSupabase() {
  return createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}


export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // No JWT required: after Stripe redirect the browser often has not restored Supabase session yet
  // (race), and the payer may not have a Tutlio account. Trust Stripe session_id + secret key.
  try {
    const { sessionId } = req.body as { sessionId?: string };
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

    const stripe = getStripe();
    const supabase = getSupabase();

    const checkout = await stripe.checkout.sessions.retrieve(sessionId);
    if (checkout.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not yet confirmed' });
    }

    const packageId = checkout.metadata?.tutlio_package_id;
    if (!packageId) return res.status(400).json({ error: 'Missing package identifier' });

    const { data: existingPackage, error: packageFetchErr } = await supabase
      .from('lesson_packages')
      .select('*, students(full_name, email, payer_email, payer_name), subjects(name)')
      .eq('id', packageId)
      .single();

    if (packageFetchErr || !existingPackage) {
      return res.status(404).json({ error: 'Paketas nerastas', details: packageFetchErr?.message });
    }

    // Idempotent: if already paid/active, don't re-update; still return success
    const packageRow = existingPackage as any;
    let finalPackage = packageRow;
    let transitionedToPaid = false;
    if (!packageRow.paid || !packageRow.active || packageRow.payment_status !== 'paid') {
      const { data: updatedPackage, error: updateErr } = await supabase
        .from('lesson_packages')
        .update({
          paid: true,
          payment_status: 'paid',
          paid_at: packageRow.paid_at || new Date().toISOString(),
          active: true,
        })
        .eq('id', packageId)
        .select('*, students(full_name, email, payer_email, payer_name), subjects(name)')
        .single();
      if (updateErr || !updatedPackage) {
        return res.status(500).json({ error: 'Nepavyko aktyvuoti paketo', details: updateErr?.message });
      }
      finalPackage = updatedPackage as any;
      transitionedToPaid = true;
    }

    const subject = finalPackage.subjects || {};

    // If there are pre-created sessions tied to this package (e.g. trial lessons),
    // mark them as paid too so UI no longer shows "awaiting payment".
    try {
      const { data: paidSessions } = await supabase
        .from('sessions')
        .update({ paid: true, payment_status: 'paid' })
        .eq('lesson_package_id', packageId)
        .eq('paid', false)
        .select('id, tutor_id');
      for (const ps of paidSessions || []) {
        syncSessionToGoogle(ps.id, ps.tutor_id).catch(() => {});
      }
    } catch (e) {
      console.error('[confirm-package-payment] Failed to update sessions for prepaid package:', e);
    }

    try {
      await markInvoicesPaidForPackage(
        supabase,
        packageId,
        (finalPackage as { manual_sales_invoice_id?: string | null }).manual_sales_invoice_id
      );
    } catch (e) {
      console.error('[confirm-package-payment] mark invoices paid:', e);
    }

    // NOTE: Email sending is handled by stripe-webhook.ts to avoid duplicates.
    // This endpoint only confirms payment status for the UI.

    return res.status(200).json({
      success: true,
      packageId: finalPackage.id,
      availableLessons: finalPackage.available_lessons,
      totalLessons: finalPackage.total_lessons,
      subjectName: subject.name,
    });
  } catch (err: any) {
    console.error('[confirm-package-payment] Error:', err);
    return res.status(500).json({ error: err?.message || 'Internal Server Error' });
  }
}
