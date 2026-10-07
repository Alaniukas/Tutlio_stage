export type SchoolInvoiceOverpaymentUse = {
  invoice_id: string;
  amount_eur: number | string;
  released_at?: string | null;
  invoice?: { invoice_number?: string | null } | null;
};

export type SchoolInvoiceOverpayment = {
  id: string;
  student_id: string;
  payer_email: string;
  amount_eur: number | string;
  reason: string;
  created_at: string;
  created_by: string;
  voided_at?: string | null;
  void_reason?: string | null;
  source_invoice_id: string;
  source?: { invoice_number?: string | null; period_end: string } | null;
  uses?: SchoolInvoiceOverpaymentUse[];
};

const cents = (value: unknown) => Math.max(0, Math.round((Number(value) || 0) * 100));

export function schoolInvoiceAmountDue(invoice: { total_eur: number | string; credit_applied_eur?: number | string | null }): number {
  return Math.max(0, cents(invoice.total_eur) - cents(invoice.credit_applied_eur)) / 100;
}

export function schoolOverpaymentRemaining(credit: SchoolInvoiceOverpayment): number {
  if (credit.voided_at) return 0;
  return Math.max(0, cents(credit.amount_eur) - (credit.uses || [])
    .filter((use) => !use.released_at).reduce((sum, use) => sum + cents(use.amount_eur), 0)) / 100;
}

export type SchoolInvoiceCreditAllocation = {
  monthLabel: string;
  amountEur: number;
  sourceInvoiceNumber?: string | null;
};

export const SCHOOL_OVERPAYMENT_MONTHS_GENITIVE = [
  'sausio', 'vasario', 'kovo', 'balandžio', 'gegužės', 'birželio',
  'liepos', 'rugpjūčio', 'rugsėjo', 'spalio', 'lapkričio', 'gruodžio',
];

/** Source invoice period for labels like „permoka iš 2026 m. rugpjūčio“. */
export function schoolOverpaymentSourceMonthLabel(periodEnd: string): string {
  const match = String(periodEnd || '').slice(0, 10).match(/^(\d{4})-(\d{2})/);
  if (!match) return String(periodEnd || '').trim();
  const month = SCHOOL_OVERPAYMENT_MONTHS_GENITIVE[Number(match[2]) - 1];
  return month ? `${match[1]} m. ${month}` : match[0];
}

export function sortSchoolInvoiceOverpayments(credits: SchoolInvoiceOverpayment[]): SchoolInvoiceOverpayment[] {
  return [...credits].sort((left, right) => {
    const byCreated = String(left.created_at || '').localeCompare(String(right.created_at || ''));
    return byCreated !== 0 ? byCreated : String(left.id).localeCompare(String(right.id));
  });
}

/** FIFO allocation matching the DB trigger on school_monthly_invoices insert. */
export function allocateSchoolInvoiceCredits(credits: SchoolInvoiceOverpayment[], totalEur: number): SchoolInvoiceCreditAllocation[] {
  let remaining = cents(totalEur);
  const allocations: SchoolInvoiceCreditAllocation[] = [];
  for (const credit of sortSchoolInvoiceOverpayments(credits)) {
    const available = cents(schoolOverpaymentRemaining(credit));
    if (!available) continue;
    const applied = Math.min(available, remaining);
    if (applied <= 0) continue;
    allocations.push({
      monthLabel: schoolOverpaymentSourceMonthLabel(credit.source?.period_end || ''),
      amountEur: applied / 100,
      sourceInvoiceNumber: credit.source?.invoice_number || null,
    });
    remaining -= applied;
    if (remaining <= 0) break;
  }
  return allocations;
}

export function schoolInvoiceCreditPreview(credits: SchoolInvoiceOverpayment[], totalEur: number) {
  const availableEur = credits.reduce((sum, credit) => sum + cents(schoolOverpaymentRemaining(credit)), 0) / 100;
  const appliedEur = Math.min(availableEur, cents(totalEur) / 100);
  return { availableEur, appliedEur, amountDueEur: (cents(totalEur) - cents(appliedEur)) / 100 };
}
