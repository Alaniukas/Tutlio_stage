// Calendar-month package validity (Pro Klase intake funnel, Phase 2, req 6).
//
// When an org has the `monthly_packages` feature on, a paid package's
// `expires_at` is set at payment-confirmation time; the existing
// expire-packages cron then deactivates it once past expiry. Two anchors:
//   * pre-booked lessons exist -> end of the FIRST lesson's calendar month
//     (the package is valid for the month the lessons are in);
//   * no pre-booked lessons    -> at least one month from payment
//     (`paid_at` + 1 month), so a package sent without assigned times never
//     burns out days after payment just because it was paid late in a month.
import type { SupabaseClient } from '@supabase/supabase-js';

type Features = Record<string, unknown> | null | undefined;

// Calendar months are resolved in the product timezone (same convention as the
// reminder/booking code, e.g. school-installment-reminders' ymdInVilnius), not
// UTC. Otherwise a lesson the admin sees as "Aug 1, 01:00" — whose UTC instant
// is "Jul 31, 22:00" — would anchor to July and expire the package immediately.
const PACKAGE_TZ = 'Europe/Vilnius';

function monthlyPackagesEnabled(features: Features): boolean {
  if (!features || typeof features !== 'object' || Array.isArray(features)) return false;
  return (features as Record<string, unknown>).monthly_packages === true;
}

/** Calendar year + month (1-12) of the given instant in the package timezone. */
function tzYearMonth(d: Date): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PACKAGE_TZ,
    year: 'numeric',
    month: '2-digit',
  }).format(d);
  const [year, month] = parts.split('-').map(Number);
  return { year, month };
}

/**
 * End of the given instant's calendar month, as a UTC ISO string. The month is
 * resolved in the package timezone, and the boundary is the first moment of the
 * next month (00:00 UTC ≈ early morning local on the 1st) — a deliberate small
 * grace so a lesson late on the last day of the month is never past expiry.
 */
export function endOfMonthIso(d: Date): string {
  const { year, month } = tzYearMonth(d); // month: 1-12
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1; // 1-12
  return new Date(Date.UTC(nextYear, nextMonth - 1, 1, 0, 0, 0, 0)).toISOString();
}

/**
 * The same wall-clock instant one calendar month later, as a UTC ISO string.
 * Day-of-month is clamped to the target month's length (Jan 31 -> Feb 28/29).
 */
export function plusOneMonthIso(d: Date): string {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth(); // 0-11
  const lastDayOfNextMonth = new Date(Date.UTC(year, month + 2, 0)).getUTCDate();
  const day = Math.min(d.getUTCDate(), lastDayOfNextMonth);
  return new Date(Date.UTC(
    year,
    month + 1,
    day,
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds(),
  )).toISOString();
}

/**
 * For `monthly_packages` orgs, set the package `expires_at`:
 * end of the earliest active linked session's calendar month when pre-booked
 * lessons exist, else `paid_at` (fallback `now`) + 1 month.
 * Idempotent and best-effort: safe to call from every payment-confirm path.
 */
export async function applyMonthlyPackageExpiry(
  supabase: SupabaseClient,
  opts: { packageId: string; tutorId?: string | null; now?: Date },
): Promise<void> {
  const { packageId, tutorId } = opts;
  if (!packageId || !tutorId) return;

  const { data: tutor } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', tutorId)
    .maybeSingle();
  const orgId = (tutor as { organization_id?: string | null } | null)?.organization_id;
  if (!orgId) return;

  const { data: org } = await supabase
    .from('organizations')
    .select('features')
    .eq('id', orgId)
    .maybeSingle();
  if (!monthlyPackagesEnabled((org as { features?: Features } | null)?.features)) return;

  const { data: firstSession } = await supabase
    .from('sessions')
    .select('start_time')
    .eq('lesson_package_id', packageId)
    .eq('status', 'active')
    .order('start_time', { ascending: true })
    .limit(1)
    .maybeSingle();

  const firstStart = (firstSession as { start_time?: string } | null)?.start_time;
  let expiresAt: string;
  const { data: pkg } = await supabase
    .from('lesson_packages')
    .select('paid_at, billing_period_end')
    .eq('id', packageId)
    .maybeSingle();
  const billingPeriodEnd = (pkg as { billing_period_end?: string | null } | null)?.billing_period_end;
  if (billingPeriodEnd) {
    // Recurring monthly plans always keep the package inside its named month.
    expiresAt = endOfMonthIso(new Date(`${billingPeriodEnd}T12:00:00.000Z`));
  } else if (firstStart) {
    // Pre-booked lessons: valid for the first lesson's calendar month.
    expiresAt = endOfMonthIso(new Date(firstStart));
  } else {
    // No assigned times: guarantee at least one month from payment.
    const paidAtRaw = (pkg as { paid_at?: string | null } | null)?.paid_at;
    const paidAt = paidAtRaw ? new Date(paidAtRaw) : null;
    const anchor = paidAt && !Number.isNaN(paidAt.getTime()) ? paidAt : opts.now ?? new Date();
    expiresAt = plusOneMonthIso(anchor);
  }

  await supabase
    .from('lesson_packages')
    .update({ expires_at: expiresAt })
    .eq('id', packageId);
}
