export type SessionPaymentDisplayKind = 'complimentary' | 'paid' | 'reserved' | 'pending';

export function isSessionActuallyPaid(session: {
  paid?: boolean | null;
  payment_status?: string | null;
}): boolean {
  return session.paid === true || session.payment_status === 'paid';
}

/**
 * `payment_status = confirmed` means the lesson is reserved without an
 * immediate per-lesson charge (monthly billing uses this state). Actual money
 * received is represented by `paid = true` or `payment_status = paid`.
 */
export function sessionPaymentDisplayKind(session: {
  paid?: boolean | null;
  payment_status?: string | null;
  is_complimentary?: boolean | null;
}): SessionPaymentDisplayKind {
  if (session.is_complimentary === true) return 'complimentary';
  if (isSessionActuallyPaid(session)) return 'paid';
  if (session.payment_status === 'confirmed') return 'reserved';
  return 'pending';
}
