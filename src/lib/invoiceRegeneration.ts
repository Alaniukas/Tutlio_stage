/** Returned only for invoices that can be replaced without changing a payment. */
export type InvoiceRegeneration = {
  invoiceIds: string[];
  invoiceNumbers: string[];
  token?: string;
};

export function confirmInvoiceRegeneration(
  invoices: InvoiceRegeneration[],
  t: (key: string, params?: Record<string, string>) => string,
): boolean {
  const numbers = [...new Set(invoices.flatMap((invoice) => invoice.invoiceNumbers))];
  return !invoices.some((invoice) => invoice.invoiceIds.length)
    || window.confirm(t('invoiceCreate.regenerateExistingConfirm', { nums: numbers.join(', ') }));
}
