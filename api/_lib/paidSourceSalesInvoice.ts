import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChargeCurrency } from './marketMoney.js';

/** Only call after Stripe has verified the payment, including successful replays. */
export async function issuePaidSourceSalesInvoice(
  supabase: SupabaseClient,
  payment: {
    sourceType: 'session' | 'package';
    sourceId: string;
    checkoutId: string | null | undefined;
    baseAmount: number | null | undefined;
    currency: ChargeCurrency;
  },
  options: { retryOnError?: boolean } = {},
): Promise<string | null> {
  if (!payment.checkoutId || payment.baseAmount == null
    || !Number.isFinite(payment.baseAmount) || payment.baseAmount <= 0) return null;

  try {
    // The database derives the seller from the locked source, never from a
    // caller-supplied organization or a tutor's personal profile for org sales.
    const { data, error } = await supabase.rpc('issue_paid_source_sales_invoice', {
      p_source_type: payment.sourceType,
      p_source_id: payment.sourceId,
      p_checkout_id: payment.checkoutId,
      p_base_amount: payment.baseAmount,
      p_currency: payment.currency.toUpperCase(),
    });
    if (error?.code === 'PT422') {
      console.warn('[paidSourceSalesInvoice] Invoice settings incomplete:', payment.sourceType, payment.sourceId);
      return null;
    }
    if (error) throw new Error(error.message);
    return typeof data === 'string' ? data : null;
  } catch (error) {
    console.error('[paidSourceSalesInvoice] Could not issue paid invoice:', payment.sourceType, payment.sourceId, error);
    // The browser can show the collected payment as successful. A webhook must
    // return an error so Stripe retries the accounting operation after recovery.
    if (options.retryOnError) throw error;
    return null;
  }
}
