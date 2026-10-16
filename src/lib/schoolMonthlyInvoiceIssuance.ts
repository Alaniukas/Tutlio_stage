export type SchoolMonthlyIssuanceInvoice = {
  id?: string;
  invoice_number?: string | null;
  student_id?: string | null;
  payer_student_ids?: string[] | null;
  period_start?: string | null;
  period_end?: string | null;
  billing_model?: string | null;
  payment_status?: string | null;
  contract_id?: string | null;
  stripe_checkout_session_id?: string | null;
  credit_applied_eur?: number | string | null;
  invoice_email_sent_at?: string | null;
  total_eur?: number | string | null;
};

function invoiceStudentIds(invoice: SchoolMonthlyIssuanceInvoice): string[] {
  const ids = invoice.payer_student_ids?.length
    ? invoice.payer_student_ids
    : (invoice.student_id ? [invoice.student_id] : []);
  return ids.map((id) => String(id));
}

export function schoolMonthlyInvoiceCoversStudents(
  invoice: SchoolMonthlyIssuanceInvoice,
  studentIds: Set<string>,
): boolean {
  const ids = invoiceStudentIds(invoice);
  return ids.length > 0 && ids.every((id) => studentIds.has(id));
}

/** Unsent, unpaid actual invoices can be replaced. Emailed invoices stay locked. */
export function isReplaceableSchoolMonthlyInvoice(
  invoice: SchoolMonthlyIssuanceInvoice,
  periodStart: string,
  periodEnd: string,
  studentIds: Set<string>,
): boolean {
  return invoice.payment_status === 'pending'
    && invoice.billing_model === 'actual'
    && !invoice.contract_id
    && !invoice.stripe_checkout_session_id
    && !Number(invoice.credit_applied_eur || 0)
    && !invoice.invoice_email_sent_at
    && invoice.period_start === periodStart
    && invoice.period_end === periodEnd
    && schoolMonthlyInvoiceCoversStudents(invoice, studentIds);
}

export function schoolMonthlyInvoicesIssuedForStudents(
  invoices: SchoolMonthlyIssuanceInvoice[],
  periodStart: string,
  periodEnd: string,
  studentIds: Set<string>,
): SchoolMonthlyIssuanceInvoice[] {
  return invoices.filter((invoice) => (
    Boolean(invoice.invoice_number)
    && Boolean(invoice.invoice_email_sent_at)
    && invoice.period_start === periodStart
    && invoice.period_end === periodEnd
    && invoiceStudentIds(invoice).some((id) => studentIds.has(id))
  ));
}

/** Payer-facing note when a later S.F. covers sessions missed by an already emailed invoice. */
export function schoolMonthlySupplementalInvoiceNote(
  issued: Array<{ invoice_number?: string | null; total_eur?: number | string | null }>,
): string | null {
  const billed = issued
    .map((invoice) => {
      const number = String(invoice.invoice_number || '').trim();
      if (!number) return '';
      const total = Number(invoice.total_eur);
      return Number.isFinite(total)
        ? `${number} (${total.toFixed(2).replace('.', ',')} €)`
        : number;
    })
    .filter(Boolean);
  if (!billed.length) return null;
  return `Atsiprašome – ankstesnėje sąskaitoje ${billed.join(', ')} šie užsiėmimai nebuvo įtraukti. Siunčiame papildomą sąskaitą tik už likusius užsiėmimus. Ankstesnės sąskaitos kartoti nereikia.`;
}
