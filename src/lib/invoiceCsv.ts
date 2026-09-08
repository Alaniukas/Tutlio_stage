export type AccountingInvoice = {
  invoice_number: string;
  issue_date: string;
  period_start?: string;
  period_end?: string;
  seller_snapshot?: { name?: string; companyCode?: string; vatCode?: string };
  buyer_snapshot?: { name?: string; email?: string; companyCode?: string; vatCode?: string };
  subtotal?: number;
  total_amount: number;
  status: string;
  billing_batches?: { paid: boolean } | null;
};

/** Excel-compatible UTF-8 CSV, including protection against spreadsheet formulas. */
export function csvCell(value: unknown): string {
  let text = String(value ?? '');
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function invoiceAccountingCsv(rows: AccountingInvoice[]): string {
  const header = ['SF numeris', 'Išrašymo data', 'Laikotarpis nuo', 'Laikotarpis iki',
    'Pardavėjas', 'Pardavėjo kodas', 'Pardavėjo PVM kodas', 'Pirkėjas', 'Pirkėjo kodas',
    'Pirkėjo el. paštas', 'Suma be PVM', 'Bendra suma', 'Būsena'];
  return '\uFEFF' + [header, ...rows.map((invoice) => [
    invoice.invoice_number, invoice.issue_date, invoice.period_start, invoice.period_end,
    invoice.seller_snapshot?.name, invoice.seller_snapshot?.companyCode, invoice.seller_snapshot?.vatCode,
    invoice.buyer_snapshot?.name, invoice.buyer_snapshot?.companyCode, invoice.buyer_snapshot?.email,
    Number(invoice.subtotal ?? invoice.total_amount).toFixed(2), Number(invoice.total_amount).toFixed(2),
    invoice.status === 'cancelled' ? 'Atšaukta' : invoice.status === 'paid' || invoice.billing_batches?.paid ? 'Apmokėta' : 'Išrašyta',
  ])].map((row) => row.map(csvCell).join(';')).join('\r\n');
}

export function downloadInvoiceCsv(rows: AccountingInvoice[], kind: 'clients' | 'tutors'): void {
  const url = URL.createObjectURL(new Blob([invoiceAccountingCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `saskaitos-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
