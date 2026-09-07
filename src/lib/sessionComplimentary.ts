export function isComplimentarySession(
  session: { is_complimentary?: boolean | null } | null | undefined,
): boolean {
  return session?.is_complimentary === true;
}

/** Client-facing revenue (org stats, invoices to payers). Complimentary is always 0. */
export function sessionClientRevenueEur(
  session: { price?: number | null; is_complimentary?: boolean | null } | null | undefined,
): number {
  if (!session || isComplimentarySession(session)) return 0;
  const n = Number(session.price);
  return Number.isFinite(n) ? n : 0;
}
