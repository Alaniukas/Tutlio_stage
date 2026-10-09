import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from '../../src/lib/fetchAllRows.js';
import { isOwnOrgTutorInvoice } from '../../src/lib/orgTutorInvoiceAccess.js';
import type { TutorPayAdjustment } from '../../src/lib/proKlaseTutorFinance.js';

type CoveredInvoice = {
  id: string; invoice_number: string; total_amount: number; period_start: string; period_end: string;
  created_at: string; pdf_meta: { tutorAdjustmentIds?: string[] };
};
type CoveredLine = { id: string; invoice_id: string; session_ids: string[]; description: string; total_price: number };
export type TutorInvoiceCoverage = { invoices: CoveredInvoice[]; lines: CoveredLine[]; sessionIds: Set<string> };

export async function loadProKlaseTutorInvoiceCoverage(
  supabase: SupabaseClient, organizationId: string, tutorId: string,
): Promise<TutorInvoiceCoverage> {
  const invoices = (await fetchAllRows<CoveredInvoice>((from, to) => supabase.from('invoices')
    .select('id, invoice_number, total_amount, period_start, period_end, created_at, pdf_meta')
    .eq('organization_id', organizationId).eq('pdf_meta->>invoiceKind', 'tutor_pay')
    .eq('pdf_meta->>tutorId', tutorId).neq('status', 'cancelled').order('id').range(from, to), Infinity))
    .filter(invoice => isOwnOrgTutorInvoice(invoice, tutorId));
  const lines: CoveredLine[] = [];
  for (let offset = 0; offset < invoices.length; offset += 100) {
    lines.push(...await fetchAllRows<CoveredLine>((from, to) => supabase.from('invoice_line_items')
      .select('id, invoice_id, session_ids, description, total_price')
      .in('invoice_id', invoices.slice(offset, offset + 100).map(invoice => invoice.id))
      .order('id').range(from, to), Infinity));
  }
  return { invoices, lines, sessionIds: new Set(lines.flatMap(line => line.session_ids || [])) };
}

export function tutorAdjustmentDescription(adjustment: Pick<TutorPayAdjustment, 'type' | 'reason'>): string {
  return adjustment.type === 'penalty_tutor_no_show' ? 'Bauda: korepetitorius neatvyko'
    : adjustment.type === 'penalty_missing_report' ? 'Bauda: nėra ataskaitos' : adjustment.reason || 'Koregavimas';
}

/** Legacy invoices have adjustment lines without IDs. Match only an actual line
 * and an adjustment that existed when that invoice was created, once per line. */
export function uninvoicedTutorAdjustments(adjustments: TutorPayAdjustment[], coverage: TutorInvoiceCoverage): TutorPayAdjustment[] {
  const recorded = new Set(coverage.invoices.flatMap(invoice => invoice.pdf_meta?.tutorAdjustmentIds || []));
  const legacy = coverage.lines.filter(line => !line.session_ids?.length).map(line => ({
    line, invoice: coverage.invoices.find(invoice => invoice.id === line.invoice_id), used: false,
  }));
  return [...adjustments].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
    .filter(adjustment => {
      if (recorded.has(adjustment.id)) return false;
      const match = legacy.find(slot => !slot.used && slot.invoice
        && !Array.isArray(slot.invoice.pdf_meta?.tutorAdjustmentIds)
        && adjustment.created_at >= slot.invoice.period_start + 'T00:00:00'
        && adjustment.created_at <= slot.invoice.period_end + 'T23:59:59.999Z'
        && Date.parse(adjustment.created_at) <= Date.parse(slot.invoice.created_at)
        && slot.line.description === tutorAdjustmentDescription(adjustment)
        && Number(slot.line.total_price) === Number(adjustment.amount_eur));
      if (match) { match.used = true; return false; }
      return true;
    });
}
