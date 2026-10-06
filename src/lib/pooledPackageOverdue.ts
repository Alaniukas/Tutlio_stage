export type UnpaidPackageRow = {
  paid?: boolean | null;
  payment_status?: string | null;
  active?: boolean | null;
  pool_organization_id?: string | null;
  billing_period_end?: string | null;
};

export function isUnpaidPackage(pkg: UnpaidPackageRow): boolean {
  return pkg.paid !== true && pkg.payment_status !== 'paid' && pkg.payment_status !== 'cancelled';
}

/** Pooled monthly offer past its billing month, or legacy cron-expired pending row. */
export function isOverdueUnpaidPooledPackage(pkg: UnpaidPackageRow, now = new Date()): boolean {
  if (!pkg.pool_organization_id || !isUnpaidPackage(pkg)) return false;
  if (pkg.payment_status === 'expired') return true;
  const periodEnd = pkg.billing_period_end;
  if (!periodEnd) return false;
  const end = new Date(`${periodEnd}T23:59:59`);
  return !Number.isNaN(end.getTime()) && end.getTime() < now.getTime();
}

export function isPayableUnpaidPooledPackage(pkg: UnpaidPackageRow): boolean {
  return Boolean(pkg.pool_organization_id) && isUnpaidPackage(pkg);
}

export function reactivateUnpaidPooledPackageUpdate() {
  return { active: true, payment_status: 'pending' as const, expires_at: null };
}
