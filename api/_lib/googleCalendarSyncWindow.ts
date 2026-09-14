export const GOOGLE_CALENDAR_SYNC_STATUSES = ['active', 'completed', 'no_show'] as const;

function ymdInVilnius(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vilnius',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(value);
}

/** Earliest session start_time included in a full Google Calendar sync. */
export function googleCalendarSyncTimeMin(now: Date = new Date()): string {
  const ymd = ymdInVilnius(now);
  const [y, m] = ymd.split('-').map(Number);
  const schoolYearStartYear = (m ?? 1) >= 9 ? (y ?? 1970) : (y ?? 1970) - 1;
  const schoolYearStart = new Date(`${schoolYearStartYear}-09-01T00:00:00+03:00`);
  const min24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const chosen = schoolYearStart.getTime() < min24h.getTime() ? schoolYearStart : min24h;
  return chosen.toISOString();
}
