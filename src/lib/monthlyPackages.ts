// Calendar-month package helpers (Pro Klase intake funnel, Phase 2, req 6).
//
// When the `monthly_packages` feature is on, a lesson can only be moved within
// the same calendar month, and a package's lessons must all be used within the
// calendar month it was paid for. These helpers keep that month math in one
// place (compared in local time, matching what users see in the calendar).

/** True when both dates fall in the same calendar year + month (local time). */
export function isSameCalendarMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/**
 * The anchor month for a reschedule is the lesson's original start (so repeated
 * moves can't drift across months); falls back to the current start when the
 * lesson hasn't been moved yet.
 */
export function rescheduleAnchorDate(
  originalStartIso: string | null | undefined,
  currentStart: Date,
): Date {
  if (originalStartIso) {
    const d = new Date(originalStartIso);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return currentStart;
}

/** Last day of the given date's calendar month at 23:59:59.999 (local time). */
export function endOfCalendarMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
