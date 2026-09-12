import type { SupabaseClient } from '@supabase/supabase-js';
import { schoolContractBillingModel } from '../../src/lib/schoolCanonicalBilling.js';

export const SCHOOL_INVOICE_RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
export type SchoolInvoiceRenderedEmail = { from: string; to: string[]; subject: string; html: string };
export type SchoolInvoiceDeliveryResult = { sent: boolean; alreadySent?: boolean; id?: string; reason?: string };

export function schoolMonthlyInvoiceIdempotencyKey(invoiceId: string): string {
  return `school-monthly-invoice/${invoiceId}`;
}

/** Service-role only. Freeze the final rendered provider payload before any send. */
export async function deliverSchoolMonthlyInvoiceOnce(params: {
  supabase: SupabaseClient;
  invoiceId: string;
  organizationId: string;
  payload: SchoolInvoiceRenderedEmail;
  send: (payload: SchoolInvoiceRenderedEmail, idempotencyKey: string) => Promise<{ id?: string; error?: string }>;
  now?: Date;
}): Promise<SchoolInvoiceDeliveryResult> {
  const { supabase, invoiceId, organizationId } = params;
  const now = params.now || new Date();
  const { data: invoice, error: invoiceError } = await supabase.from('school_monthly_invoices')
    .select('id, organization_id, payment_status, invoice_email_sent_at, billing_model, contract:school_contracts(filled_body,order_snapshot)')
    .eq('id', invoiceId).eq('organization_id', organizationId).maybeSingle();
  if (invoiceError || !invoice) return { sent: false, reason: invoiceError?.message || 'invoice not found in organization' };
  if (invoice.invoice_email_sent_at) return { sent: false, alreadySent: true };
  const frozenContract = Array.isArray(invoice.contract) ? invoice.contract[0] : invoice.contract;
  const model = schoolContractBillingModel({ organization_id: organizationId, filled_body: frozenContract?.filled_body, order_snapshot: frozenContract?.order_snapshot });
  if (model === 'review' || (model === 'actual' && invoice.billing_model !== 'actual')) {
    return { sent: false, reason: 'invoice billing model requires review against frozen contract' };
  }
  if (invoice.payment_status !== 'pending') return { sent: false, reason: 'invoice is not pending' };

  const load = () => supabase.from('school_monthly_invoice_deliveries').select('*')
    .eq('id', invoiceId).eq('organization_id', organizationId).maybeSingle();
  let { data: delivery, error } = await load();
  if (error) return { sent: false, reason: `delivery state unavailable: ${error.message}` };
  if (!delivery) {
    const inserted = await supabase.from('school_monthly_invoice_deliveries').insert({
      id: invoiceId, organization_id: organizationId, payload: params.payload, attempted_at: now.toISOString(),
    }).select('*').single();
    if (inserted.error?.code === '23505') {
      const raced = await load();
      delivery = raced.data; error = raced.error;
    } else { delivery = inserted.data; error = inserted.error; }
    if (error || !delivery) return { sent: false, reason: error?.message || 'could not reserve delivery' };
  }

  const stampInvoice = async () => {
    const result = await supabase.from('school_monthly_invoices')
      .update({ invoice_email_sent_at: delivery.sent_at }).eq('id', invoiceId).eq('organization_id', organizationId);
    return result.error;
  };
  if (delivery.sent_at) {
    const stampError = await stampInvoice();
    return stampError ? { sent: false, reason: `invoice stamp failed: ${stampError.message}` }
      : { sent: false, alreadySent: true, id: delivery.provider_message_id || undefined };
  }
  const age = now.getTime() - Date.parse(delivery.attempted_at);
  if (!delivery.payload || !Number.isFinite(age) || age < 0 || age >= SCHOOL_INVOICE_RETRY_WINDOW_MS) {
    return { sent: false, reason: 'delivery requires review: provider deduplication window expired or legacy state' };
  }

  let outcome: { id?: string; error?: string };
  try { outcome = await params.send(delivery.payload as SchoolInvoiceRenderedEmail, schoolMonthlyInvoiceIdempotencyKey(invoiceId)); }
  catch (e) { outcome = { error: (e as Error).message || 'provider request failed' }; }
  if (outcome.error || !outcome.id) {
    const reason = outcome.error || 'provider did not confirm a message id';
    await supabase.from('school_monthly_invoice_deliveries').update({ last_error: reason })
      .eq('id', invoiceId).eq('organization_id', organizationId);
    return { sent: false, reason };
  }
  delivery.sent_at = now.toISOString();
  const marked = await supabase.from('school_monthly_invoice_deliveries')
    .update({ sent_at: delivery.sent_at, provider_message_id: outcome.id, last_error: null })
    .eq('id', invoiceId).eq('organization_id', organizationId);
  if (marked.error) return { sent: false, reason: `provider accepted; delivery stamp failed: ${marked.error.message}` };
  const stampError = await stampInvoice();
  if (stampError) return { sent: false, reason: `provider accepted; invoice stamp failed: ${stampError.message}` };
  return { sent: true, id: outcome.id };
}
