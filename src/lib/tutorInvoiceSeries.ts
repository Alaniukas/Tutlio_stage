/** A readable default series for independently invoicing tutors. */
export function tutorInvoiceSeries(fullName: string): string {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  const letters = (value: string) => value.replace(/[^\p{L}]/gu, '').slice(0, 3).toLocaleUpperCase('lt-LT');
  return (letters(parts[0] || '') + (parts.length > 1 ? letters(parts[parts.length - 1]) : '')) || 'KOR';
}

export function suggestedTutorInvoiceNumber(oldNumber: string, fullName: string): string {
  const suffix = oldNumber.match(/-(\d+)$/)?.[1] || '001';
  return `${tutorInvoiceSeries(fullName)}-${suffix}`;
}
