import { supabase } from '@/lib/supabase';
import { authHeaders } from '@/lib/apiHelpers';

/**
 * After marking a session as paid, check if it belongs to a billing batch.
 * If ALL sessions in that batch are now paid, auto-close the batch and invoice
 * via the existing confirm-monthly-invoice-payment API (fire-and-forget).
 */
export async function autoCloseBillingBatchIfAllPaid(sessionId: string): Promise<void> {
  try {
    const { data: batchLink } = await supabase
      .from('billing_batch_sessions')
      .select('billing_batch_id')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (!batchLink?.billing_batch_id) return;

    const { data: batch } = await supabase
      .from('billing_batches')
      .select('id, paid')
      .eq('id', batchLink.billing_batch_id)
      .maybeSingle();

    if (!batch || batch.paid) return;

    const { data: allBatchSessions } = await supabase
      .from('billing_batch_sessions')
      .select('session_id')
      .eq('billing_batch_id', batchLink.billing_batch_id);

    if (!allBatchSessions || allBatchSessions.length === 0) return;

    const sessionIds = allBatchSessions.map(bs => bs.session_id);
    const { data: unpaidSessions } = await supabase
      .from('sessions')
      .select('id')
      .in('id', sessionIds)
      .eq('paid', false)
      .limit(1);

    if (unpaidSessions && unpaidSessions.length > 0) return;

    await fetch('/api/confirm-monthly-invoice-payment', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        billingBatchId: batchLink.billing_batch_id,
        manualConfirm: true,
      }),
    });
  } catch (e) {
    console.error('[autoCloseBillingBatch] check failed:', e);
  }
}
