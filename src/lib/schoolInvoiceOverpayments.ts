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

export function schoolInvoiceCreditPreview(credits: SchoolInvoiceOverpayment[], totalEur: number) {
  const availableEur = credits.reduce((sum, credit) => sum + cents(schoolOverpaymentRemaining(credit)), 0) / 100;
  const appliedEur = Math.min(availableEur, cents(totalEur) / 100);
  return { availableEur, appliedEur, amountDueEur: (cents(totalEur) - cents(appliedEur)) / 100 };
}
