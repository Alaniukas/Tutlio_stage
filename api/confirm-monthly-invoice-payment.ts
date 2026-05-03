// Vercel Serverless Function: Confirm monthly invoice payment (idempotent)
// POST /api/confirm-monthly-invoice-payment
// Body: { checkoutSessionId: string }
import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { isOrgTutor } from './_lib/isOrgTutor.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' as any });
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await verifyRequestAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { checkoutSessionId, billingBatchId: billingBatchIdFromBody, manualConfirm } = req.body as {
      checkoutSessionId?: string;
      billingBatchId?: string;
      /** Tutor marks monthly batch paid off-platform (Sąskaitos); requires batch.tutor_id === auth user */
      manualConfirm?: boolean;
    };

    let billingBatchId: string | undefined = billingBatchIdFromBody;

    if (manualConfirm === true) {
      if (!billingBatchIdFromBody) {
        return res.status(400).json({ error: 'Missing billingBatchId' });
      }
      const { data: ownBatch, error: ownErr } = await supabase
        .from('billing_batches')
        .select('id, tutor_id, paid')
        .eq('id', billingBatchIdFromBody)
        .maybeSingle();
      if (ownErr || !ownBatch) {
        return res.status(404).json({ error: 'Billing batch not found' });
      }
      if (ownBatch.tutor_id !== auth.userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      billingBatchId = billingBatchIdFromBody;
      if (ownBatch.paid === true) {
        try {
          await supabase
            .from('invoices')
            .update({ status: 'paid' })
            .eq('billing_batch_id', billingBatchId)
            .eq('status', 'issued');
        } catch {
          /* ignore */
        }
        return res.status(200).json({ success: true, alreadyPaid: true });
      }
    } else if (!checkoutSessionId && !billingBatchIdFromBody) {
      return res.status(400).json({ error: 'Missing checkoutSessionId or billingBatchId' });
    }

    // 1) Optional: validate with Stripe checkout session (extra safety)
    if (!manualConfirm && checkoutSessionId) {
      try {
        const checkoutSession = await stripe.checkout.sessions.retrieve(checkoutSessionId);

        // Only proceed when Stripe says it is paid
        console.log('[confirm-monthly-invoice-payment] checkoutSession:', {
          checkoutSessionId,
          payment_status: checkoutSession.payment_status,
          billingBatchId: checkoutSession.metadata?.tutlio_billing_batch_id,
        });
        if (checkoutSession.payment_status !== 'paid') {
          return res.status(200).json({ success: false, reason: `Payment status: ${checkoutSession.payment_status}` });
        }

        billingBatchId = billingBatchId || checkoutSession.metadata?.tutlio_billing_batch_id;
      } catch (err: any) {
        // Checkout session not found or expired - this is OK if we have billingBatchId from frontend
        console.warn('[confirm-monthly-invoice-payment] Could not retrieve checkout session (may be expired or wrong account):', err.message);
        if (!billingBatchId) {
          return res.status(400).json({ error: 'Checkout session not found and no billingBatchId provided', details: err.message });
        }
        // Continue with billingBatchId from frontend
      }
    }

    if (!billingBatchId) return res.status(400).json({ error: 'Missing billingBatchId' });

    // 2) Idempotently update billing batch: only when transitioning false -> true
    console.log('[confirm-monthly-invoice-payment] Attempting to update billing batch:', billingBatchId);
    const {
      data: updatedBatch,
      error: updateErr,
    } = await supabase
      .from('billing_batches')
      .update({
        paid: true,
        payment_status: 'paid',
        paid_at: new Date().toISOString(),
      })
      .eq('id', billingBatchId)
      .eq('paid', false)
      .select('id, tutor_id, payer_email, payer_name, total_amount, period_start_date, period_end_date, paid, payment_status')
      .single();

    console.log('[confirm-monthly-invoice-payment] Update result:', { updatedBatch, updateErr });

    if (updateErr) {
      // If row didn't match (already paid), Supabase returns "no rows" error; treat as already paid.
      if ((updateErr as any).code === 'PGRST116') {
        console.log('[confirm-monthly-invoice-payment] Already paid (PGRST116):', billingBatchId);
        return res.status(200).json({ success: true, alreadyPaid: true });
      }
      console.error('[confirm-monthly-invoice-payment] Error updating billing batch:', updateErr);
      return res.status(500).json({ error: updateErr.message || 'Failed to update billing batch', details: updateErr });
    }

    if (!updatedBatch || updatedBatch.paid !== true) {
      console.log('[confirm-monthly-invoice-payment] Already paid (no update):', billingBatchId);
      return res.status(200).json({ success: true, alreadyPaid: true });
    }

    console.log('[confirm-monthly-invoice-payment] Successfully updated billing batch to paid:', billingBatchId);

    // 3) Mark sessions in the batch as paid
    const { data: batchSessions } = await supabase
      .from('billing_batch_sessions')
      .select('session_id')
      .eq('billing_batch_id', billingBatchId);

    const sessionIds = (batchSessions || []).map(bs => bs.session_id);
    console.log('[confirm-monthly-invoice-payment] Marking sessions as paid:', sessionIds.length, 'sessions');
    if (sessionIds.length > 0) {
      const { error: sessionsUpdateErr } = await supabase.from('sessions')
        .update({ paid: true, payment_status: 'paid' })
        .in('id', sessionIds);

      if (sessionsUpdateErr) {
        console.error('[confirm-monthly-invoice-payment] Error updating sessions:', sessionsUpdateErr);
      } else {
        console.log('[confirm-monthly-invoice-payment] Successfully marked sessions as paid');
      }
    }

    try {
      await supabase
        .from('invoices')
        .update({ status: 'paid' })
        .eq('billing_batch_id', billingBatchId)
        .eq('status', 'issued');
    } catch (invErr) {
      console.error('[confirm-monthly-invoice-payment] Error marking invoice as paid:', invErr);
    }

    // 4) Collect emails (payer + tutor + student(s) if different)
    const { data: tutorProfile, error: tutorErr } = await supabase
      .from('profiles')
      .select('id, full_name, email, organization_id')
      .eq('id', updatedBatch.tutor_id)
      .single();

    if (tutorErr || !tutorProfile) {
      return res.status(500).json({ error: tutorErr?.message || 'Tutor not found for billing batch' });
    }

    const tutorName = tutorProfile.full_name || 'Korepetitorius';
    const tutorEmail = tutorProfile.email || null;

    const periodStart = new Date(updatedBatch.period_start_date);
    const periodEnd = new Date(updatedBatch.period_end_date);
    const periodText = `${periodStart.toLocaleDateString('lt-LT')} - ${periodEnd.toLocaleDateString('lt-LT')}`;

    const payerEmail = updatedBatch.payer_email || null;
    const payerName = updatedBatch.payer_name || 'Gerbiamasis kliente';

    // Get student emails connected to these sessions.
    let studentPairs: Array<{ email: string; name: string }> = [];
    if (sessionIds.length > 0) {
      try {
        const { data: sessionsForStudents, error: sessionsErr } = await supabase
          .from('sessions')
          .select('id, student_id')
          .in('id', sessionIds);

        if (sessionsErr) throw sessionsErr;

        const studentIds = Array.from(new Set((sessionsForStudents || []).map((s: any) => s.student_id).filter(Boolean)));
        if (studentIds.length > 0) {
          const { data: studentsRows, error: studentsErr } = await supabase
            .from('students')
            .select('id, email, full_name')
            .in('id', studentIds);
          if (studentsErr) throw studentsErr;

          studentPairs = (studentsRows || []).flatMap((st: any) => {
            const email = st?.email;
            const name = st?.full_name;
            return email ? [{ email, name: name || 'Mokinys' }] : [];
          });
        }
      } catch (e) {
        // Still send payer + tutor confirmations even if student email fetch fails.
        console.error('[confirm-monthly-invoice-payment] Failed to fetch student emails:', e);
      }
    }

    const uniqueByEmail = new Map<string, { email: string; recipientName: string }>();

    if (payerEmail) uniqueByEmail.set(payerEmail, { email: payerEmail, recipientName: payerName });
    for (const sp of studentPairs) {
      if (payerEmail && sp.email === payerEmail) continue;
      uniqueByEmail.set(sp.email, { email: sp.email, recipientName: sp.name });
    }
    if (tutorEmail && !isOrgTutor(tutorProfile.organization_id)) {
      uniqueByEmail.set(tutorEmail, { email: tutorEmail, recipientName: tutorName });
    }

    // 5) Send emails
    const sessionsCount = (batchSessions || []).length || 0;
    const totalAmount = Number(updatedBatch.total_amount || 0).toFixed(2);

    const emailPromises: Promise<any>[] = [];
    console.log('[confirm-monthly-invoice-payment] Sending emails to:', Array.from(uniqueByEmail.keys()), {
      billingBatchId,
      sessionsCount,
      totalAmount,
    });
    for (const r of uniqueByEmail.values()) {
      emailPromises.push(
        fetch(`${APP_URL}/api/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
          body: JSON.stringify({
            type: 'monthly_invoice_paid',
            to: r.email,
            data: {
              recipientName: r.recipientName,
              tutorName,
              periodText,
              totalAmount,
              sessionsCount,
            },
          }),
        }).catch(() => {})
      );
    }

    await Promise.all(emailPromises);

    return res.status(200).json({ success: true, confirmed: true, billingBatchId });
  } catch (err: any) {
    console.error('[confirm-monthly-invoice-payment] Error:', err);
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
}

