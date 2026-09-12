export type SchoolDashboardContract = {
  kind?: string | null;
  signing_status?: string | null;
  completion_submitted_at?: string | null;
  accepted_at?: string | null;
  signatures?: Array<{ role?: string | null; status?: string | null }> | null;
};

/** Parent still has to confirm data, sign, or accept an extra-lessons offer. */
export function isSchoolParentConfirmationPending(contract: SchoolDashboardContract): boolean {
  if (contract.kind === 'extra_lessons') {
    return contract.signing_status === 'sent' && !contract.accepted_at;
  }
  if (contract.signing_status === 'sent') return true;
  if (contract.signing_status !== 'signed_by_school') return false;
  return (contract.signatures || []).some(signature => (
    signature.role === 'school' && signature.status === 'signed'
  ));
}

export function schoolParentConfirmationLabel(contract: SchoolDashboardContract):
  | 'data'
  | 'signature'
  | 'offer' {
  if (contract.kind === 'extra_lessons') return 'offer';
  return contract.signing_status === 'signed_by_school' ? 'signature' : 'data';
}

export function sumPendingSchoolInvoices(
  invoices: Array<{ total_eur?: number | string | null; payment_status?: string | null }>,
): number {
  let cents = 0;
  for (const invoice of invoices) {
    if (invoice.payment_status !== 'pending') continue;
    const amount = Number(invoice.total_eur);
    if (Number.isFinite(amount)) cents += Math.round(amount * 100);
  }
  return cents / 100;
}
