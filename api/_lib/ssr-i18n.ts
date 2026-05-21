import type { Locale } from './seo-routing.js';
import { lt } from '../../src/lib/i18n/lt.js';
import { en } from '../../src/lib/i18n/en.js';
import { pl } from '../../src/lib/i18n/pl.js';
import { lv } from '../../src/lib/i18n/lv.js';
import { ee } from '../../src/lib/i18n/ee.js';
import { fr } from '../../src/lib/i18n/fr.js';
import { es } from '../../src/lib/i18n/es.js';
import { de } from '../../src/lib/i18n/de.js';
import { se } from '../../src/lib/i18n/se.js';
import { dk } from '../../src/lib/i18n/dk.js';
import { fi } from '../../src/lib/i18n/fi.js';
import { no } from '../../src/lib/i18n/no.js';

const translations: Record<Locale, Record<string, string>> = {
  lt,
  en,
  pl,
  lv,
  ee,
  fr,
  es,
  de,
  se,
  dk,
  fi,
  no,
};

/** Static locale bundle (Vercel-safe). Kept async for call-site compatibility. */
export async function preloadSsrLocales(..._locales: Locale[]): Promise<void> {
  /* translations loaded at module init */
}

export function t(locale: Locale, key: string, params?: Record<string, string | number>): string {
  let text =
    translations[locale]?.[key] ?? translations.en[key] ?? translations.lt[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

export function translationKeys(locale: Locale, prefix: string): string[] {
  const dict = translations[locale] ?? translations.en;
  return Object.keys(dict).filter((k) => k.startsWith(`${prefix}.`)).sort();
}
