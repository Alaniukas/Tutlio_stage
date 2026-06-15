import type { SupabaseClient } from '@supabase/supabase-js';
import { metadataBaseAmount, metadataCurrency, type ChargeCurrency } from './marketMoney.js';

export type PlatformFeeSourceType = 'session' | 'package' | 'billing_batch' | 'penalty';

/**
 * Records the platform fee the payer was charged on a paid Stripe checkout
 * (B2C income for accounting; see admin "B2C suvestinė"). Idempotent on
 * (source_type, source_id). Skips rows where the payer paid no fee
 * (school-org absorbed flow). Never throws — accounting must not break payments.
 */
export async function recordStripePlatformFee(
  supabase: SupabaseClient,
  params: {
    sourceType: PlatformFeeSourceType;
    sourceId: string;
    /** Amount that belongs to the tutor/org (after credits) in charge currency. */
    baseAmountEur: number | null | undefined;
    /** Total the payer was charged (Stripe amount_total / 100) in charge currency. */
    grossAmountEur: number | null | undefined;
    currency?: ChargeCurrency;
    organizationId?: string | null;
    tutorId?: string | null;
    stripeCheckoutSessionId?: string | null;
  },
): Promise<void> {
  try {
    if (params.baseAmountEur == null || params.grossAmountEur == null) return;
    const base = Math.round(Number(params.baseAmountEur) * 100) / 100;
    const gross = Math.round(Number(params.grossAmountEur) * 100) / 100;
    if (!Number.isFinite(base) || !Number.isFinite(gross) || gross <= 0) return;
    const fee = Math.round((gross - base) * 100) / 100;
    if (fee <= 0) return;
    const currency = (params.currency ?? 'eur').toUpperCase();

    const { error } = await supabase.from('platform_fee_ledger').upsert(
      {
        source_type: params.sourceType,
        source_id: params.sourceId,
        provider: 'stripe',
        organization_id: params.organizationId ?? null,
        tutor_id: params.tutorId ?? null,
        base_amount: base,
        platform_fee: fee,
        gross_amount: gross,
        currency,
        stripe_checkout_session_id: params.stripeCheckoutSessionId ?? null,
        paid_at: new Date().toISOString(),
      },
      { onConflict: 'source_type,source_id', ignoreDuplicates: true },
    );
    if (error) {
      console.error('[platformFeeLedger] upsert failed:', error.message);
    }
  } catch (e) {
    console.error('[platformFeeLedger] unexpected error:', e);
  }
}

/** @deprecated Use metadataBaseAmount from marketMoney.js */
export function metadataBaseEur(
  metadata: Record<string, string> | null | undefined,
): number | null {
  return metadataBaseAmount(metadata);
}

export { metadataBaseAmount, metadataCurrency };
