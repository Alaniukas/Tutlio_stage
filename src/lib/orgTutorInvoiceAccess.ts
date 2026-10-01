/** Automatic customer billing may store the tutor as issued_by_user_id.
 * Neither the issuer nor a referenced lesson grants access to client finances.
 * Only the stored tutor-pay purpose and beneficiary identify a tutor's invoice.
 */
export function isOwnOrgTutorInvoice(invoice: { pdf_meta?: unknown }, tutorId: string): boolean {
  const meta = invoice.pdf_meta;
  return Boolean(tutorId) && typeof meta === 'object' && meta !== null
    && 'invoiceKind' in meta && meta.invoiceKind === 'tutor_pay'
    && 'tutorId' in meta && meta.tutorId === tutorId;
}
