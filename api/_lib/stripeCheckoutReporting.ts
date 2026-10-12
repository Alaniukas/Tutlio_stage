type SupabaseLike = { from: (table: string) => any };

/** Set these on both Checkout and payment_intent_data at creation time.
 * Stripe snapshots PaymentIntent metadata onto the Charge; later PI updates
 * cannot repair the Charge metadata used by balance-history exports.
 */
export function checkoutPaymentReporting(
  payerName: string | null | undefined,
  invoiceNumbers: Array<string | null | undefined> = [],
) {
  const payer = String(payerName || '').trim();
  const numbers = [...new Set(invoiceNumbers.map(number => String(number || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .join(', ');
  const metadata: Record<string, string> = {
    ...(payer ? { payer_name: payer } : {}),
    ...(numbers ? { invoice_number: numbers } : {}),
  };
  return { description: [numbers, payer].filter(Boolean).join(' · '), metadata };
}

/** Legacy checkouts without reporting fields must be recreated, not updated. */
export function checkoutReportingMatches(
  session: { metadata?: Record<string, string> | null },
  reporting: ReturnType<typeof checkoutPaymentReporting>,
): boolean {
  return Object.keys(reporting.metadata).length > 0
    && (session.metadata?.payer_name || '') === (reporting.metadata.payer_name || '')
    && (session.metadata?.invoice_number || '') === (reporting.metadata.invoice_number || '');
}

export async function billingBatchInvoiceNumbers(supabase: SupabaseLike, batchId: string): Promise<string[]> {
  const { data, error } = await supabase.from('invoices')
    .select('invoice_number')
    .eq('billing_batch_id', batchId)
    .neq('status', 'cancelled');
  if (error) throw new Error('Unable to load billing batch invoice numbers');
  return (data || []).map((invoice: { invoice_number?: string | null }) => invoice.invoice_number).filter(Boolean);
}

export async function linkedSalesInvoiceNumbers(supabase: SupabaseLike, invoiceId?: string | null): Promise<string[]> {
  if (!invoiceId) return [];
  const { data, error } = await supabase.from('invoices')
    .select('invoice_number')
    .eq('id', invoiceId)
    .neq('status', 'cancelled')
    .maybeSingle();
  if (error) throw new Error('Unable to load sales invoice number');
  return data?.invoice_number ? [data.invoice_number] : [];
}
