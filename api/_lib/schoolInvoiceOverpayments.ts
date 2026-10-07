import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from '../../src/lib/fetchAllRows.js';
import { schoolOverpaymentRemaining, type SchoolInvoiceOverpayment } from '../../src/lib/schoolInvoiceOverpayments.js';

export const SCHOOL_OVERPAYMENTS_SELECT = '*, source:school_monthly_invoices!source_invoice_id(invoice_number,period_end), uses:school_invoice_overpayment_uses(invoice_id,amount_eur,released_at,invoice:school_monthly_invoices!invoice_id(invoice_number))';

export async function loadSchoolInvoiceOverpayments(db: SupabaseClient, organizationId: string, studentIds?: string[]): Promise<SchoolInvoiceOverpayment[]> {
  if (studentIds && !studentIds.length) return [];
  return fetchAllRows<SchoolInvoiceOverpayment>((from, to) => {
    let query = db.from('school_invoice_overpayments').select(SCHOOL_OVERPAYMENTS_SELECT)
      .eq('organization_id', organizationId).order('created_at').order('id').range(from, to);
    if (studentIds) query = query.in('student_id', studentIds);
    return query;
  });
}

export function availableSchoolInvoiceOverpayments(credits: SchoolInvoiceOverpayment[], periodStart: string, payerEmail: string): SchoolInvoiceOverpayment[] {
  const email = payerEmail.trim().toLowerCase();
  return credits.filter((credit) => email && credit.payer_email === email && credit.source?.period_end
    && credit.source.period_end < periodStart && schoolOverpaymentRemaining(credit) > 0);
}
