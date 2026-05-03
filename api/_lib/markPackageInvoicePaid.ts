import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Mark formal sales invoices (S.F.) as paid after a lesson package Stripe checkout succeeds.
 * Prefer lesson_packages.manual_sales_invoice_id; also match invoice_line_items.session_ids (package id stored as pseudo-session).
 */
export async function markInvoicesPaidForPackage(
  supabase: SupabaseClient,
  packageId: string,
  manualSalesInvoiceId: string | null | undefined
): Promise<void> {
  const ids = new Set<string>();
  if (manualSalesInvoiceId) ids.add(manualSalesInvoiceId);

  const { data: fromLines } = await supabase
    .from('invoice_line_items')
    .select('invoice_id')
    .contains('session_ids', [packageId]);

  for (const row of fromLines || []) {
    if ((row as { invoice_id?: string }).invoice_id) ids.add((row as { invoice_id: string }).invoice_id);
  }

  if (ids.size === 0) return;

  await supabase
    .from('invoices')
    .update({ status: 'paid' })
    .in('id', [...ids])
    .eq('status', 'issued');
}
