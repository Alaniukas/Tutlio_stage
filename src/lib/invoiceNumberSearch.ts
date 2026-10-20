/** Match stored numbers with or without series, separators and leading zeroes. */
export function matchesInvoiceNumber(invoiceNumber: string, search: string): boolean {
  const compact = (value: string) => value.trim().toUpperCase()
    .replace(/\d+/g, digits => digits.replace(/^0+(?=\d)/, ''))
    .replace(/[\s\p{P}]+/gu, '');
  const query = compact(search);
  if (!query) return true;
  if (/^\d+$/.test(query)) {
    const digits = invoiceNumber.trim().match(/\d+$/)?.[0];
    return Boolean(digits?.replace(/^0+(?=\d)/, '').includes(query.replace(/^0+(?=\d)/, '')));
  }
  return compact(invoiceNumber).includes(query);
}
