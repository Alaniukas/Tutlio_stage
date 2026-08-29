import { resolvePlatformTranslation } from './platformOverrides';
import { type Platform, DEFAULT_PLATFORM } from '@/lib/platform';
import { SUPPORTED_LOCALES, type Locale } from './locales';

export { SUPPORTED_LOCALES } from './locales';
export type { Locale } from './locales';

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
  nl: 'NL',
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
  nl: 'Nederlands',
};

/** Internal URL slugs retain historical country-like codes, but HTML `lang`
 * and hreflang require real language codes. */
const HTML_LANGUAGE_CODES: Record<Locale, string> = {
  lt: 'lt', en: 'en', pl: 'pl', lv: 'lv', ee: 'et', fr: 'fr', es: 'es',
  de: 'de', se: 'sv', dk: 'da', fi: 'fi', no: 'no', nl: 'nl',
};

export function htmlLanguageCode(locale: Locale): string {
  return HTML_LANGUAGE_CODES[locale];
}

type Dict = Record<string, string>;

/**
 * Every dictionary loads on demand, including domain defaults. main.tsx waits
 * for the URL's initial locale before rendering, so this removes roughly 1 MB
 * of unrelated LT/EN/PL copy from the shared entry without causing a language
 * flash. A visitor downloads one locale instead of all three defaults.
 */
const translations: Partial<Record<Locale, Dict>> = {};

const DICT_LOADERS: Record<Locale, () => Promise<Dict>> = {
  lt: () => import('./lt').then((m) => m.lt),
  en: () => import('./en').then((m) => m.en),
  pl: () => import('./pl').then((m) => m.pl),
  lv: () => import('./lv').then((m) => m.lv),
  ee: () => import('./ee').then((m) => m.ee),
  fr: () => import('./fr').then((m) => m.fr),
  es: () => import('./es').then((m) => m.es),
  de: () => import('./de').then((m) => m.de),
  se: () => import('./se').then((m) => m.se),
  dk: () => import('./dk').then((m) => m.dk),
  fi: () => import('./fi').then((m) => m.fi),
  no: () => import('./no').then((m) => m.no),
  nl: () => import('./nl').then((m) => m.nl),
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
  let text = translations[locale]?.[key]
    ?? translations.en?.[key]
    ?? translations.lt?.[key];
  if (text === undefined) {
    text = Object.values(translations).find((dict) => dict?.[key])?.[key] ?? key;
  }
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
