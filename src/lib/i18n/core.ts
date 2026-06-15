import { lt } from './lt';
import { en } from './en';
import { pl } from './pl';
import { resolvePlatformTranslation } from './platformOverrides';
import { type Platform, DEFAULT_PLATFORM } from '@/lib/platform';

export type Locale = 'lt' | 'en' | 'pl' | 'lv' | 'ee' | 'fr' | 'es' | 'de' | 'se' | 'dk' | 'fi' | 'no';

export const SUPPORTED_LOCALES: Locale[] = ['lt', 'en', 'pl', 'lv', 'ee', 'fr', 'es', 'de', 'se', 'dk', 'fi', 'no'];

export const LOCALE_LABELS: Record<Locale, string> = {
  lt: 'LT',
  en: 'EN',
  pl: 'PL',
  lv: 'LV',
  ee: 'EE',
  fr: 'FR',
  es: 'ES',
  de: 'DE',
  se: 'SE',
  dk: 'DK',
  fi: 'FI',
  no: 'NO',
};

export const LOCALE_NAMES: Record<Locale, string> = {
  lt: 'Lietuvių',
  en: 'English',
  pl: 'Polski',
  lv: 'Latviešu',
  ee: 'Eesti',
  fr: 'Français',
  es: 'Español',
  de: 'Deutsch',
  se: 'Svenska',
  dk: 'Dansk',
  fi: 'Suomi',
  no: 'Norsk',
};

type Dict = Record<string, string>;

/**
 * Domain-default locales (tutlio.lt / tutlio.com / tutlio.pl) ship in the main
 * bundle so the first paint is always in the right language for each domain.
 * The other nine dictionaries (~2.5 MB of source) load on demand via
 * loadLocaleDict() — most visitors never need them.
 */
const translations: Partial<Record<Locale, Dict>> = { lt, en, pl };

const DICT_LOADERS: Record<Locale, () => Promise<Dict>> = {
  lt: () => Promise.resolve(lt),
  en: () => Promise.resolve(en),
  pl: () => Promise.resolve(pl),
  lv: () => import('./lv').then((m) => m.lv),
  ee: () => import('./ee').then((m) => m.ee),
  fr: () => import('./fr').then((m) => m.fr),
  es: () => import('./es').then((m) => m.es),
  de: () => import('./de').then((m) => m.de),
  se: () => import('./se').then((m) => m.se),
  dk: () => import('./dk').then((m) => m.dk),
  fi: () => import('./fi').then((m) => m.fi),
  no: () => import('./no').then((m) => m.no),
};

const pendingLoads = new Map<Locale, Promise<void>>();

export function isLocaleLoaded(locale: Locale): boolean {
  return !!translations[locale];
}

/** Idempotent; resolves immediately for already-loaded locales. */
export function loadLocaleDict(locale: Locale): Promise<void> {
  if (translations[locale]) return Promise.resolve();
  let load = pendingLoads.get(locale);
  if (!load) {
    load = DICT_LOADERS[locale]()
      .then((dict) => {
        translations[locale] = dict;
      })
      .finally(() => pendingLoads.delete(locale));
    pendingLoads.set(locale, load);
  }
  return load;
}

/** HTML-escape a single interpolated value. Translation strings are trusted
 *  (developer-authored) and may contain markup, but interpolated params can be
 *  user-controlled, so they must never be injected raw into an HTML sink. */
function escapeHtmlParam(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveTemplate(locale: Locale, key: string, platform: Platform): string {
  // en/lt are always bundled, so the fallback chain never depends on a lazy load.
  const text = translations[locale]?.[key] ?? en[key] ?? lt[key] ?? key;
  if (platform !== DEFAULT_PLATFORM) {
    return resolvePlatformTranslation(platform, locale, key, text);
  }
  return text;
}

function applyParams(
  text: string,
  params: Record<string, string | number> | undefined,
  escape: (value: string) => string,
): string {
  if (!params) return text;
  let out = text;
  for (const [k, v] of Object.entries(params)) {
    out = out.replaceAll(`{${k}}`, escape(String(v)));
  }
  return out;
}

export function t(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>,
  platform: Platform = DEFAULT_PLATFORM,
): string {
  return applyParams(resolveTemplate(locale, key, platform), params, (v) => v);
}

/**
 * Like `t`, but HTML-escapes interpolated param values. Use this — never `t` —
 * whenever the result is rendered through `dangerouslySetInnerHTML`, so a
 * user-controlled value (a name, email, etc.) cannot inject markup/script.
 */
export function tHtml(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>,
  platform: Platform = DEFAULT_PLATFORM,
): string {
  return applyParams(resolveTemplate(locale, key, platform), params, escapeHtmlParam);
}

export function detectLocaleFromHost(host: string): Locale {
  if (host.includes('tutlio.pl')) return 'pl';
  if (host.includes('tutlio.com')) return 'en';
  return 'lt';
}

export function isValidLocale(value: string): value is Locale {
  return SUPPORTED_LOCALES.includes(value as Locale);
}
