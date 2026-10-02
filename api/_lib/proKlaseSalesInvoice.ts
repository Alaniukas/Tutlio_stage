import type { SupabaseClient } from '@supabase/supabase-js';
import { isProKlaseOrg } from './marketMoney.js';

/** Called after Stripe verification, also on successful payment replays. */
export async function tryIssueProKlasePaidSourceInvoice(
  supabase: SupabaseClient,
  payment: {
    organizationId: string | null | undefined;
    sourceType: 'session' | 'package';
    sourceId: string;
    checkoutId: string | null | undefined;
    baseAmountEur: number | null | undefined;
  },
): Promise<string | null> {
  if (!isProKlaseOrg(payment.organizationId) || !payment.checkoutId) return null;
  if (payment.baseAmountEur == null || !Number.isFinite(payment.baseAmountEur) || payment.baseAmountEur <= 0) return null;
  try {
    const { data, error } = await supabase.rpc('issue_proklase_paid_source_invoice', {
      p_source_type: payment.sourceType,
      p_source_id: payment.sourceId,
      p_checkout_id: payment.checkoutId,
      p_base_amount: payment.baseAmountEur,
    });
    if (error) throw new Error(error.message);
    return typeof data === 'string' ? data : null;
  } catch (error) {
    // An accounting failure must not undo a payment. Both confirmation paths
    // retry the same locked source; the reconciliation can repair old failures.
    console.error('[proKlaseSalesInvoice] Could not issue paid invoice:', payment.sourceType, payment.sourceId, error);
    return null;
  }
}
