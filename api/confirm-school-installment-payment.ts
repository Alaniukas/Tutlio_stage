import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';

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

    const { data: updatedInstallment, error: updateErr } = await supabase
      .from('school_payment_installments')
      .update({
        payment_status: 'paid',
        paid_at: new Date().toISOString(),
        stripe_payment_intent_id: (session as any).payment_intent || null,
      })
      .eq('id', resolvedInstallmentId)
      .eq('payment_status', 'pending')
      .select('id, installment_number, amount, contract_id')
      .maybeSingle();

    if (updateErr) return res.status(500).json({ error: updateErr.message });

    // If already paid, report success as idempotent.
    const effectiveInstallment = updatedInstallment
      ? updatedInstallment
      : (await supabase
          .from('school_payment_installments')
          .select('id, installment_number, amount, contract_id')
          .eq('id', resolvedInstallmentId)
          .maybeSingle()).data;

    if (!effectiveInstallment) return res.status(404).json({ error: 'Installment not found' });

    // On first paid installment, ensure invite code and send parent invite.
    const { data: allInstallments } = await supabase
      .from('school_payment_installments')
      .select('id, payment_status, installment_number')
      .eq('contract_id', effectiveInstallment.contract_id)
      .order('installment_number');

    const paidInstallments = (allInstallments || []).filter((i) => i.payment_status === 'paid');
    const firstPaid = paidInstallments.length === 1 ? paidInstallments[0] : null;
    // Send invite only on the first successful pending->paid transition (idempotent).
    if (updatedInstallment && firstPaid?.id === resolvedInstallmentId) {
      const studentId = String(session.metadata?.tutlio_student_id || '').trim();
      if (studentId) {
        const { data: student } = await supabase
          .from('students')
          .select('id, invite_code, full_name, email, payer_email')
          .eq('id', studentId)
          .maybeSingle();

        if (student) {
          let inviteCode = student.invite_code;
          if (!inviteCode) {
            inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            await supabase.from('students').update({ invite_code: inviteCode }).eq('id', student.id);
          }
          const recipientEmail = student.payer_email || student.email;
          if (recipientEmail) {
            const bookingUrl = `${APP_URL}/book/${inviteCode}`;
            await fetch(`${APP_URL}/api/send-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-internal-key': serviceRoleKey },
              body: JSON.stringify({
                type: 'invite_email',
                to: recipientEmail,
                data: {
                  context: 'school',
                  studentName: student.full_name,
                  tutorName: 'Mokykla',
                  inviteCode,
                  bookingUrl,
                },
              }),
            }).catch(() => {});
          }
        }
      }
    }

    return res.status(200).json({ success: true, installmentId: resolvedInstallmentId });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Failed to confirm school installment payment' });
  }
}
