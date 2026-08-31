import { UI_RELEASED_LOCALES } from './localeRelease.js';
import { LOCALE_FORMAT_TAGS, LOCALE_NAMES, type Locale } from './locales.js';

/** Keep public language-count copy tied to the actual production selector. */
export function localeAvailabilityParams(locale: Locale): { count: number; languages: string } {
  const names = UI_RELEASED_LOCALES.map((releasedLocale) => LOCALE_NAMES[releasedLocale]);
  return {
    count: UI_RELEASED_LOCALES.length,
    languages: new Intl.ListFormat(LOCALE_FORMAT_TAGS[locale], {
      style: 'long',
      type: 'conjunction',
    }).format(names),
  };
}
