// POST /api/perlas-callback
// Public endpoint — receives server-side callbacks from PerlasFinance.
// Validates JWT signature, handles payment and payout callbacks.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { verifyPerlasToken } from './_lib/perlasFinance.js';

const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function handlePaymentCallback(decoded: Record<string, unknown>, supabase: ReturnType<typeof getSupabase>) {
  const transactionId = String(decoded.transactionId || '');
  const status = String(decoded.status || '');

  if (!transactionId) {
    console.error('[perlas-callback] payment: missing transactionId');
    return;
  }

  if (status === 'refund') {
    console.warn('[perlas-callback] payment refund for tx:', transactionId);
    await supabase
      .from('sessions')
      .update({ paid: false, payment_status: 'refunded' })
      .eq('perlas_transaction_id', transactionId)
      .eq('paid', true);
    // Remove pending ledger entry; for reserved/paid_out entries, set net_amount to 0
    // so they don't contribute to future payouts
    await supabase
      .from('perlas_ledger')
      .delete()
      .eq('perlas_transaction_id', transactionId)
      .eq('status', 'pending');
    await supabase
      .from('perlas_ledger')
      .update({ net_amount: 0, volume: 0, platform_fee: 0, perlas_fee: 0 })
      .eq('perlas_transaction_id', transactionId)
      .in('status', ['reserved', 'paid_out']);
    return;
  }

  if (status !== 'success') {
    console.warn('[perlas-callback] payment non-success status:', status, 'tx:', transactionId);
    return;
  }

  const { data: session, error: sessErr } = await supabase
    .from('sessions')
    .select(`
      id, price, topic, student_id, tutor_id, start_time, end_time, paid,
      students(full_name, email, payment_payer, payer_email),
      profiles!sessions_tutor_id_fkey(full_name, email, organization_id)
    `)
    .eq('perlas_transaction_id', transactionId)
    .maybeSingle();

  if (sessErr) {
    console.error('[perlas-callback] session lookup error:', sessErr.message);
    return;
  }
  if (!session) {
    console.warn('[perlas-callback] no session for tx:', transactionId);
    return;
  }
  if (session.paid) return; // idempotent

  const { error: updateErr } = await supabase
    .from('sessions')
    .update({ paid: true, payment_status: 'paid' })
    .eq('id', session.id)
    .eq('paid', false);

  if (updateErr) {
    console.error('[perlas-callback] session update error:', updateErr.message);
    return;
  }

  const student = session.students as any;
  const tutor = session.profiles as any;

  // Insert perlas_ledger row for balance tracking (idempotent: skip if already exists)
  const price = Number(session.price ?? 0);
  if (price > 0) {
    const { data: existingLedger } = await supabase
      .from('perlas_ledger')
      .select('id')
      .eq('perlas_transaction_id', transactionId)
      .limit(1);

    if (!existingLedger || existingLedger.length === 0) {
      const orgId = tutor?.organization_id as string | null;
      const entityType = orgId ? 'org' : 'tutor';
      const entityId = orgId || session.tutor_id;

      const { data: feeRows } = await supabase
        .from('platform_settings')
        .select('key, value')
        .in('key', [
          'perlas_platform_fee_percent', 'perlas_provider_fee_percent',
          'perlas_platform_fee_fixed', 'perlas_provider_fee_fixed',
        ]);
      const settings: Record<string, number> = {};
      for (const r of feeRows || []) settings[r.key] = Number(r.value || 0);

      const platformFee = Math.round(
        (price * (settings.perlas_platform_fee_percent || 0) / 100 + (settings.perlas_platform_fee_fixed || 0)) * 100
      ) / 100;
      const perlasFee = Math.round(
        (price * (settings.perlas_provider_fee_percent || 0) / 100 + (settings.perlas_provider_fee_fixed || 0)) * 100
      ) / 100;
      const netAmount = Math.round((price - platformFee - perlasFee) * 100) / 100;

      const { error: ledgerErr } = await supabase.from('perlas_ledger').insert({
        entity_type: entityType,
        entity_id: entityId,
        session_id: session.id,
        perlas_transaction_id: transactionId,
        volume: price,
        net_amount: Math.max(netAmount, 0),
        platform_fee: platformFee,
        perlas_fee: perlasFee,
        status: 'pending',
      });
      if (ledgerErr) {
        console.error('[perlas-callback] ledger insert error:', ledgerErr.message);
      }
    }
  }

  // Send confirmation emails (reuse existing email templates)
  const sessionStart = new Date(session.start_time);
  const durationMs = new Date(session.end_time).getTime() - sessionStart.getTime();
  const durationMinutes = Math.round(durationMs / 60000);
  const dateStr = sessionStart.toLocaleDateString('lt-LT', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const timeStr = sessionStart.toLocaleTimeString('lt-LT', { hour: '2-digit', minute: '2-digit' });
  const sendEmailUrl = `${APP_URL}/api/send-email`;

  const emailData = {
    studentName: student?.full_name,
    tutorName: tutor?.full_name || 'Korepetitorius',
    date: dateStr,
    time: timeStr,
    subject: session.topic,
    price: session.price,
    lessonPriceEur: session.price,
    duration: durationMinutes,
  };

  const recipients = new Set<string>();
  if (student?.email) recipients.add(student.email);
  if (student?.payment_payer === 'parent' && student?.payer_email) {
    recipients.add(student.payer_email);
  }

  for (const email of recipients) {
    try {
      await fetch(sendEmailUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
        body: JSON.stringify({ type: 'payment_success', to: email, data: emailData }),
      });
    } catch (e) {
      console.error('[perlas-callback] email failed:', email, e);
    }
  }

  if (tutor?.email) {
    try {
      await fetch(sendEmailUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '' },
        body: JSON.stringify({
          type: 'payment_received_tutor',
          to: tutor.email,
          data: {
            studentName: student?.full_name,
            tutorName: tutor.full_name || 'Korepetitorius',
            date: dateStr,
            time: timeStr,
            subject: session.topic,
            price: session.price,
          },
        }),
      });
    } catch (e) {
      console.error('[perlas-callback] tutor email failed:', e);
    }
  }
}

async function handlePayoutCallback(decoded: Record<string, unknown>, supabase: ReturnType<typeof getSupabase>) {
  // Legacy payout callbacks — kept for backwards compatibility with any in-flight payouts
  const transactionId = String(decoded.transactionId || '');
  const status = String(decoded.status || '');
  if (!transactionId) return;

  if (status === 'success') {
    await supabase.from('payouts')
      .update({ status: 'success', confirmed_at: new Date().toISOString() })
      .eq('perlas_transaction_id', transactionId)
      .eq('status', 'processing');
  } else if (status === 'failed') {
    await supabase.from('payouts')
      .update({ status: 'failed', failed_reason: String(decoded.comment || 'Payout rejected') })
      .eq('perlas_transaction_id', transactionId)
      .eq('status', 'processing');
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body as { data?: string };
    if (!body?.data || typeof body.data !== 'string') {
      return res.status(400).json({ status: 'error', message: 'Missing data field' });
    }

    let decoded: Record<string, unknown>;
    try {
      decoded = verifyPerlasToken(body.data);
    } catch (e: any) {
      console.error('[perlas-callback] JWT verification failed:', e.message);
      return res.status(400).json({ status: 'error', message: 'Invalid token' });
    }

    const supabase = getSupabase();
    const type = String(decoded.type || 'payment');

    if (type === 'payout') {
      await handlePayoutCallback(decoded, supabase);
    } else {
      await handlePaymentCallback(decoded, supabase);
    }

    return res.status(200).json({ status: 'success' });
  } catch (err: any) {
    console.error('[perlas-callback] Error:', err);
    return res.status(200).json({ status: 'success' });
  }
}
