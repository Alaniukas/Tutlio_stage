/** Pooled monthly credits apply only to lessons inside their Vilnius billing dates. */
export function packageCoversLessonDate(pkg: {
  pool_organization_id?: string | null;
  billing_period_start?: string | null;
  billing_period_end?: string | null;
}, start: Date): boolean {
  if (!pkg.pool_organization_id) return true;
  if (!pkg.billing_period_start || !pkg.billing_period_end || !Number.isFinite(start.getTime())) return false;
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit', day: '2-digit' }).format(start);
  return date >= pkg.billing_period_start && date <= pkg.billing_period_end;
}
