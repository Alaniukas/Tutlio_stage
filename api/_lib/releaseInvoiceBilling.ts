import type { SupabaseClient } from '@supabase/supabase-js';

type BatchRow = {
  id: string;
  paid: boolean | null;
  payment_status: string | null;
};

/** Release a monthly payer billing batch so its lessons can be invoiced again. */
export async function releaseBillingBatchForReissue(
  supabase: SupabaseClient,
  billingBatchId: string,
): Promise<{ sessionIds: string[]; wasPaid: boolean }> {
  const { data: batch, error: batchErr } = await supabase
    .from('billing_batches')
    .select('id, paid, payment_status')
    .eq('id', billingBatchId)
    .maybeSingle();

  if (batchErr) throw batchErr;
  if (!batch) return { sessionIds: [], wasPaid: false };

  const wasPaid = batch.paid === true || batch.payment_status === 'paid';

  const { data: batchSessions } = await supabase
    .from('billing_batch_sessions')
    .select('session_id')
    .eq('billing_batch_id', billingBatchId);

  const sessionIds = (batchSessions || []).map((bs) => bs.session_id).filter(Boolean) as string[];

  if (sessionIds.length > 0) {
    const sessionUpdate = sessionReleaseUpdate(wasPaid);
    const { error: sessErr } = await supabase.from('sessions').update(sessionUpdate).in('id', sessionIds);
    if (sessErr) throw sessErr;
  }

  await supabase.from('billing_batch_sessions').delete().eq('billing_batch_id', billingBatchId);
  await supabase.from('billing_batches').delete().eq('id', billingBatchId);

  await supabase
    .from('invoices')
    .update({ status: 'cancelled' })
    .eq('billing_batch_id', billingBatchId)
    .in('status', ['issued', 'paid']);

  return { sessionIds, wasPaid };
}

export async function collectInvoiceLineSessionIds(
  supabase: SupabaseClient,
  invoiceId: string,
): Promise<string[]> {
  const { data: lineItems } = await supabase
    .from('invoice_line_items')
    .select('session_ids')
    .eq('invoice_id', invoiceId);

  const sessionIds = new Set<string>();
  for (const li of lineItems || []) {
    const ids = Array.isArray((li as { session_ids?: string[] }).session_ids)
      ? (li as { session_ids: string[] }).session_ids
      : [];
    for (const sid of ids) sessionIds.add(sid);
  }
  return Array.from(sessionIds);
}

export function billingBatchWasPaid(batch: Pick<BatchRow, 'paid' | 'payment_status'> | null | undefined): boolean {
  return batch?.paid === true || batch?.payment_status === 'paid';
}

export function sessionReleaseUpdate(wasPaid: boolean): {
  payment_batch_id: null;
  paid?: false;
  payment_status?: 'pending';
} {
  return wasPaid
    ? { payment_batch_id: null, paid: false, payment_status: 'pending' }
    : { payment_batch_id: null };
}
