import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const auth = await verifyRequestAuth(req);
  if (!auth || !auth.userId) return res.status(401).json({ error: 'Unauthorized' });

  const { billingBatchId } = req.body as { billingBatchId?: string };
  if (!billingBatchId) {
    return res.status(400).json({ error: 'Missing billingBatchId' });
  }

  try {
    const { data: batch, error: batchErr } = await supabase
      .from('billing_batches')
      .select('id, tutor_id, paid, payment_status, stripe_checkout_session_id')
      .eq('id', billingBatchId)
      .single();

    if (batchErr || !batch) {
      return res.status(404).json({ error: 'Billing batch not found' });
    }

    if (batch.tutor_id !== auth.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (batch.paid === true || batch.payment_status === 'paid') {
      return res.status(400).json({ error: 'Cannot regenerate a paid invoice' });
    }

    const { data: batchSessions } = await supabase
      .from('billing_batch_sessions')
      .select('session_id')
      .eq('billing_batch_id', billingBatchId);

    const sessionIds = (batchSessions || []).map(bs => bs.session_id).filter(Boolean);

    if (sessionIds.length > 0) {
      await supabase
        .from('sessions')
        .update({ payment_batch_id: null })
        .in('id', sessionIds);
    }

    await supabase
      .from('billing_batch_sessions')
      .delete()
      .eq('billing_batch_id', billingBatchId);

    await supabase
      .from('invoices')
      .update({ status: 'cancelled' })
      .eq('billing_batch_id', billingBatchId)
      .eq('status', 'issued');

    await supabase
      .from('billing_batches')
      .delete()
      .eq('id', billingBatchId);

    return res.status(200).json({
      success: true,
      freedSessionIds: sessionIds,
    });
  } catch (err: any) {
    console.error('[regenerate-monthly-invoice] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
