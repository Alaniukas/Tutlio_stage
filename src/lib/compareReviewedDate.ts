import { LOCALE_FORMAT_TAGS, type Locale } from './i18n/locales.js';

/** "5 September 2026" in the page language, from an ISO date. */
export function formatReviewedDate(locale: Locale, isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  try {
    return new Intl.DateTimeFormat(LOCALE_FORMAT_TAGS[locale], { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(date);
  } catch {
    return isoDate;
  }
}
