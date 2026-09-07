import { interpolateTranslation } from './interpolate.js';
import { resolvePlatformTranslation } from './platformOverrides';
import { applySchoolTerminology } from './schoolTerminology';
import { getSchoolTerminology, getSchoolTerminologyVersion } from './terminologyStore';
import { type Platform, DEFAULT_PLATFORM } from '@/lib/platform';
import { SUPPORTED_LOCALES, type Locale } from './locales';

export { SUPPORTED_LOCALES } from './locales';
export type { Locale } from './locales';

export { LOCALE_LABELS, LOCALE_NAMES, htmlLanguageCode } from './locales';

type Dict = Record<string, string>;

/**
 * Every dictionary loads on demand, including domain defaults. LocaleProvider
 * waits for the URL's initial locale before mounting App, removing roughly 1 MB
 * of unrelated LT/EN/PL copy from the shared entry without causing a language
 * flash. A visitor downloads one locale instead of all three defaults.
 */
const translations: Partial<Record<Locale, Dict>> = {};

const DICT_LOADERS: Record<Locale, () => Promise<Dict>> = {
  th: () => import('./th').then((m) => m.th),
  'zh-hk': () => import('./zh-hk').then((m) => m.zhHk),
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
  'it': () => import('./it').then((m) => m.it),
  'pt': () => import('./pt').then((m) => m.pt),
  'ro': () => import('./ro').then((m) => m.ro),
  'cs': () => import('./cs').then((m) => m.cs),
  'el': () => import('./el').then((m) => m.el),
  'hu': () => import('./hu').then((m) => m.hu),
  'bg': () => import('./bg').then((m) => m.bg),
  'hr': () => import('./hr').then((m) => m.hr),
  'sk': () => import('./sk').then((m) => m.sk),
  'sl': () => import('./sl').then((m) => m.sl),
  'hi': () => import('./hi').then((m) => m.hi),
  'ko': () => import('./ko').then((m) => m.ko),
  'ja': () => import('./ja').then((m) => m.ja),
  'id': () => import('./id').then((m) => m.id),
  'ar': () => import('./ar').then((m) => m.ar),
  'pt-br': () => import('./pt-br').then((m) => m.ptBr),
  'es-mx': () => import('./es-mx').then((m) => m.esMx),
  fil: () => import('./fil').then((m) => m.fil),
  tr: () => import('./tr').then((m) => m.tr),
  he: () => import('./he').then((m) => m.he),
  uk: () => import('./uk').then((m) => m.uk),
};

const pendingLoads = new Map<Locale, Promise<void>>();
const cacheListeners = new Set<() => void>();

function notifyLocaleCacheListeners(): void {
  for (const listener of cacheListeners) listener();
}

/** Dev/HMR: drop cached dictionaries so the next load fetches fresh modules. */
export function invalidateLocaleCache(locale?: Locale): void {
  if (locale) {
    delete translations[locale];
    pendingLoads.delete(locale);
  } else {
    for (const key of Object.keys(translations)) {
      delete translations[key as Locale];
    }
    pendingLoads.clear();
  }
  notifyLocaleCacheListeners();
}

export function subscribeLocaleCache(listener: () => void): () => void {
  cacheListeners.add(listener);
  return () => cacheListeners.delete(listener);
}

export function hasPendingLocaleLoads(): boolean {
  return pendingLoads.size > 0;
}

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
        if (!dict || typeof dict !== 'object') {
          throw new Error(`Locale dictionary "${locale}" did not export a map`);
        }
        translations[locale] = dict;
        notifyLocaleCacheListeners();
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

/** Memo for the school wording pass — `t()` runs on every render, the regex pass is not free. */
const terminologyMemo = new Map<string, string>();
const TERMINOLOGY_MEMO_LIMIT = 6000;

function resolveTemplate(locale: Locale, key: string, platform: Platform): string {
  let text = translations[locale]?.[key]
    ?? translations.en?.[key]
    ?? translations.lt?.[key];
  if (text === undefined) {
    text = Object.values(translations).find((dict) => dict?.[key])?.[key] ?? key;
  }
  if (platform !== DEFAULT_PLATFORM) {
    text = resolvePlatformTranslation(platform, locale, key, text);
  }
  const terminology = getSchoolTerminology();
  if (terminology.staff || terminology.activity) {
    // Platform routes (/school/*) already swapped staff wording; only the missing part runs.
    const mode = {
      staff: terminology.staff && platform === DEFAULT_PLATFORM,
      activity: terminology.activity,
    };
    if (mode.staff || mode.activity) {
      const memoKey = `${getSchoolTerminologyVersion()}|${locale}|${platform}|${mode.staff ? 1 : 0}${mode.activity ? 1 : 0}|${key}`;
      const cached = terminologyMemo.get(memoKey);
      if (cached !== undefined) return cached;
      const out = applySchoolTerminology(text, locale, mode, key);
      if (terminologyMemo.size >= TERMINOLOGY_MEMO_LIMIT) terminologyMemo.clear();
      terminologyMemo.set(memoKey, out);
      return out;
    }
  }
  return text;
}

function applyParams(
  text: string,
  params: Record<string, string | number> | undefined,
  escape: (value: string) => string,
): string {
  return interpolateTranslation(text, params, escape);
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

type ViteHotContextLike = {
  dispose(callback: () => void): void;
  accept(dependencies: string[], callback: () => void): void;
};

const hot = (import.meta as ImportMeta & { hot?: ViteHotContextLike }).hot;
if (hot) {
  hot.dispose(() => {
    invalidateLocaleCache();
    window.dispatchEvent(new Event('tutlio:locale-cache-invalidate'));
  });
  hot.accept(
    [
      './lt.ts', './en.ts', './pl.ts', './lv.ts', './ee.ts', './fr.ts', './es.ts',
      './de.ts', './se.ts', './dk.ts', './fi.ts', './no.ts', './nl.ts',
    ],
    () => {
      invalidateLocaleCache();
      window.dispatchEvent(new Event('tutlio:locale-cache-invalidate'));
    },
  );
}
