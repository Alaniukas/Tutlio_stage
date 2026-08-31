const PAID_SESSION_STATUSES = new Set(['paid', 'confirmed']);
const CLOSED_SESSION_STATUSES = new Set(['cancelled', 'canceled']);
const CLOSED_PACKAGE_STATUSES = new Set(['paid', 'cancelled', 'canceled', 'expired']);

export function sessionCountsAsUnpaid(row: {
  paid?: boolean | null;
  payment_status?: string | null;
  status?: string | null;
  is_complimentary?: boolean | null;
  price?: number | null;
}): boolean {
  if (row.is_complimentary === true) return false;
  if (CLOSED_SESSION_STATUSES.has(String(row.status || '').toLowerCase())) return false;
  if (row.paid === true) return false;
  if (PAID_SESSION_STATUSES.has(String(row.payment_status || '').toLowerCase())) return false;
  return Number(row.price || 0) > 0;
}

export function packageCountsAsUnpaid(row: {
  paid?: boolean | null;
  payment_status?: string | null;
}): boolean {
  if (row.paid === true) return false;
  return !CLOSED_PACKAGE_STATUSES.has(String(row.payment_status || '').toLowerCase());
}

export function invoiceCountsAsUnpaid(row: {
  paid?: boolean | null;
  payment_status?: string | null;
}): boolean {
  if (row.paid === true) return false;
  const status = String(row.payment_status || '').toLowerCase();
  if (status === 'paid' || status === 'void' || status === 'cancelled' || status === 'canceled') return false;
  return true;
}
