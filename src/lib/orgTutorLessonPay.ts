/**
 * Org tutor pay per lesson is stored in profiles.company_commission_percent (EUR / lesson).
 * When unset (0), fall back to the session's student-facing price for invoice preview and totals.
 */
export function orgTutorLessonPayEur(
  tutorPayRate: number | null | undefined,
  sessionPrice: number | null | undefined,
): number {
  const rate = Number(tutorPayRate);
  if (Number.isFinite(rate) && rate > 0) return rate;
  const price = Number(sessionPrice);
  return Number.isFinite(price) && price > 0 ? price : 0;
}
