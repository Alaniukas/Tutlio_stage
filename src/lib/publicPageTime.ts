/** Use the page's advertised timezone in both its picker and enquiry emails. */
export function publicPageTimeZone(value: unknown): string {
  if (typeof value === 'string' && value.trim()) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return value;
    } catch { /* Keep older or invalid rows usable with the schema's default. */ }
  }
  return 'Europe/Vilnius';
}

export function publicPageSlotDay(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: publicPageTimeZone(timeZone), calendar: 'gregory',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(iso));
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function formatPublicPageSlotTime(iso: string, formatLocale: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString(formatLocale, {
    timeZone: publicPageTimeZone(timeZone), hour: '2-digit', minute: '2-digit',
  });
}
