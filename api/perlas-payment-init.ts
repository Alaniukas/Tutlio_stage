// POST /api/perlas-payment-init
// Body: { sessionId: string }
// Initiates a PerlasFinance bank link payment for a lesson session.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { signPerlasToken, generateTransactionId, PERLAS_API_URL } from './_lib/perlasFinance.js';

const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await verifyRequestAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  const { sessionId } = req.body as { sessionId?: string };
  if (!sessionId) return res.status(400).json({ error: 'sessionId is required' });

  try {
    const supabase = getSupabase();

    const { data: session, error: sessErr } = await supabase
      .from('sessions')
      .select(`
        id, price, topic, student_id, tutor_id, paid, perlas_transaction_id,
        profiles!sessions_tutor_id_fkey(
          full_name, organization_id, perlas_finance_enabled
        )
      `)
      .eq('id', sessionId)
      .single();

    if (sessErr || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.paid) {
      return res.status(400).json({ error: 'Session is already paid' });
    }

    const tutor = session.profiles as any;
    let perlasEnabled = !!tutor?.perlas_finance_enabled;

    if (tutor?.organization_id) {
      const { data: org } = await supabase
        .from('organizations')
        .select('perlas_finance_enabled')
        .eq('id', tutor.organization_id)
        .single();
      perlasEnabled = !!org?.perlas_finance_enabled;
    }

    if (!perlasEnabled) {
      return res.status(400).json({ error: 'PerlasFinance payments are not enabled for this tutor' });
    }

    const price = Number(session.price ?? 0);
    if (price <= 0) {
      return res.status(400).json({ error: 'Session has no valid price' });
    }

    const transactionId = session.perlas_transaction_id || generateTransactionId();
    const ownerName = tutor?.full_name || 'Korepetitorius';
    const paymentPurpose = `Tutlio pamoka – ${ownerName}`.slice(0, 100);
    const returnUrl = `${APP_URL}/perlas-success?tutlio_session=${sessionId}`;

    const token = signPerlasToken({
      amount: price.toFixed(2),
      paymentPurpose,
      transactionId,
      currency: 'EUR',
      returnUrl,
    });

    if (!session.perlas_transaction_id) {
      await supabase
        .from('sessions')
        .update({ perlas_transaction_id: transactionId })
        .eq('id', sessionId);
    }

    return res.status(200).json({
      token,
      url: PERLAS_API_URL,
      transactionId,
    });
  } catch (err: any) {
    console.error('[perlas-payment-init] Error:', err);
    return res.status(500).json({ error: err.message });
  }
}
