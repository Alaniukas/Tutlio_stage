import { interpolateTranslation } from '../../src/lib/i18n/interpolate.js';
import type { Locale } from './seo-routing.js';
import { loadExtraLocaleDict, preloadExtraLocaleDict } from './loadExtraLocaleDict.js';
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
import { nl } from '../../src/lib/i18n/nl.js';

const translations: Partial<Record<Locale, Record<string, string>>> = {
  lt, en, pl, lv, ee, fr, es, de, se, dk, fi, no, nl,
};

function dictFor(locale: Locale): Record<string, string> | undefined {
  return translations[locale] ?? loadExtraLocaleDict(locale);
}

/**
 * Every renderer awaits this before its first t(). Legacy dictionaries are
 * static imports; the newer ones are loaded here with a real dynamic import so
 * the same code path works on Vercel, under tsx and under vitest.
 */
export async function preloadSsrLocales(...locales: Locale[]): Promise<void> {
  await Promise.all(
    locales.map(async (locale) => {
      if (translations[locale]) return;
      await preloadExtraLocaleDict(locale);
    }),
  );
}

export function t(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const text =
    dictFor(locale)?.[key] ?? dictFor('en')?.[key] ?? dictFor('lt')?.[key] ?? key;
  return interpolateTranslation(text, params);
}

export function translationKeys(locale: Locale, prefix: string): string[] {
  const dict = dictFor(locale) ?? dictFor('en') ?? {};
  return Object.keys(dict).filter((k) => k.startsWith(`${prefix}.`)).sort();
}
