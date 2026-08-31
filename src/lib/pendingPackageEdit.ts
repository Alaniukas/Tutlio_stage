export const PENDING_PACKAGE_EDIT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type PendingPackageEditGate = {
  paid?: boolean | null;
  payment_status?: string | null;
  created_at?: string | null;
};

export function pendingPackageEditDenial(
  pkg: PendingPackageEditGate,
  now: Date = new Date(),
): string | null {
  if (pkg.paid === true || pkg.payment_status === 'paid') return 'paid';
  if (pkg.payment_status === 'cancelled') return 'cancelled';
  if (pkg.payment_status === 'expired') return 'expired';
  if (pkg.payment_status && pkg.payment_status !== 'pending') return 'not_pending';
  const created = pkg.created_at ? new Date(pkg.created_at) : null;
  if (!created || Number.isNaN(created.getTime())) return 'missing_created_at';
  if (now.getTime() - created.getTime() > PENDING_PACKAGE_EDIT_WINDOW_MS) return 'too_old';
  return null;
}

export function canEditPendingPackage(pkg: PendingPackageEditGate, now: Date = new Date()): boolean {
  return pendingPackageEditDenial(pkg, now) === null;
}

export async function expireOpenCheckoutSession(
  expire: (sessionId: string) => Promise<unknown>,
  sessionId: string | null | undefined,
): Promise<boolean> {
  const id = typeof sessionId === 'string' ? sessionId.trim() : '';
  if (!id) return false;
  try {
    await expire(id);
    return true;
  } catch {
    return false;
  }
}
