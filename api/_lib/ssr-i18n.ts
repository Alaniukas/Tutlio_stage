import { interpolateTranslation } from '../../src/lib/i18n/interpolate.js';
import { it } from '../../src/lib/i18n/it.js';
import { fil } from '../../src/lib/i18n/fil.js';
import { th } from '../../src/lib/i18n/th.js';
import { tr } from '../../src/lib/i18n/tr.js';
import { zhHk } from '../../src/lib/i18n/zh-hk.js';
import { pt } from '../../src/lib/i18n/pt.js';
import { ro } from '../../src/lib/i18n/ro.js';
import { cs } from '../../src/lib/i18n/cs.js';
import { el } from '../../src/lib/i18n/el.js';
import { hu } from '../../src/lib/i18n/hu.js';
import { bg } from '../../src/lib/i18n/bg.js';
import { hr } from '../../src/lib/i18n/hr.js';
import { sk } from '../../src/lib/i18n/sk.js';
import { sl } from '../../src/lib/i18n/sl.js';
import { hi } from '../../src/lib/i18n/hi.js';
import { ko } from '../../src/lib/i18n/ko.js';
import { ja } from '../../src/lib/i18n/ja.js';
import { id } from '../../src/lib/i18n/id.js';
import { ar } from '../../src/lib/i18n/ar.js';
import { he } from '../../src/lib/i18n/he.js';
import { uk } from '../../src/lib/i18n/uk.js';
import { ptBr } from '../../src/lib/i18n/pt-br.js';
import { esMx } from '../../src/lib/i18n/es-mx.js';
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
import { nl } from '../../src/lib/i18n/nl.js';

const translations: Record<Locale, Record<string, string>> = {
  th,
  'zh-hk': zhHk,
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
  nl,
  'it': it,
  fil,
  tr,
  'pt': pt,
  'ro': ro,
  'cs': cs,
  'el': el,
  'hu': hu,
  'bg': bg,
  'hr': hr,
  'sk': sk,
  'sl': sl,
  'hi': hi,
  'ko': ko,
  'ja': ja,
  'id': id,
  'ar': ar,
  he,
  uk,
  'pt-br': ptBr,
  'es-mx': esMx,
};

/** Static locale bundle (Vercel-safe). Kept async for call-site compatibility. */
export async function preloadSsrLocales(..._locales: Locale[]): Promise<void> {
  /* translations loaded at module init */
}

export function t(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const text =
    translations[locale]?.[key] ?? translations.en[key] ?? translations.lt[key] ?? key;
  return interpolateTranslation(text, params);
}

export function translationKeys(locale: Locale, prefix: string): string[] {
  const dict = translations[locale] ?? translations.en;
  return Object.keys(dict).filter((k) => k.startsWith(`${prefix}.`)).sort();
}
