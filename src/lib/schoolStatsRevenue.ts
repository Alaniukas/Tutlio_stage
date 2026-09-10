import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from './fetchAllRows';

type Receipt = { id: string; amount?: number | string; total_eur?: number | string; payment_status: string; paid_at: string | null };

export function sumSchoolReceipts(rows: Receipt[], startIso: string, endIso: string): number {
  const seen = new Set<string>();
  let cents = 0;
  for (const row of rows) {
    const paidAt = Date.parse(row.paid_at || '');
    if (seen.has(row.id) || row.payment_status !== 'paid' || !Number.isFinite(paidAt)
      || paidAt < Date.parse(startIso) || paidAt > Date.parse(endIso)) continue;
    seen.add(row.id);
    const amount = Number(row.amount ?? row.total_eur);
    if (Number.isFinite(amount)) cents += Math.round(amount * 100);
  }
  return cents / 100;
}
/** Cash receipts by payment date, never a sum of generated zero-price lesson rows. */
export async function loadSchoolStatsRevenue(db: SupabaseClient, organizationId: string, startIso: string, endIso: string): Promise<number> {
  const [installments, monthly] = await Promise.all([
    fetchAllRows<any>((from, to) => db.from('school_payment_installments')
      .select('id, amount, payment_status, paid_at, school_contracts!inner(organization_id, kind)')
      .eq('school_contracts.organization_id', organizationId).eq('payment_status', 'paid')
      .gte('paid_at', startIso).lte('paid_at', endIso).order('id').range(from, to)),
    fetchAllRows<any>((from, to) => db.from('school_monthly_invoices')
      .select('id, total_eur, payment_status, paid_at').eq('organization_id', organizationId)
      .eq('payment_status', 'paid').gte('paid_at', startIso).lte('paid_at', endIso)
      .order('id').range(from, to)),
  ]);
  const annual = installments.filter(row => {
    const contract = Array.isArray(row.school_contracts) ? row.school_contracts[0] : row.school_contracts;
    return contract && contract.kind !== 'extra_lessons';
  });
  return Math.round((sumSchoolReceipts(annual, startIso, endIso) + sumSchoolReceipts(monthly, startIso, endIso)) * 100) / 100;
}
