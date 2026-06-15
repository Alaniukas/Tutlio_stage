import { createContext, useCallback, useContext } from 'react';
import { lt as dateFnsLt, pl as dateFnsPl, lv as dateFnsLv, et as dateFnsEe, fr as dateFnsFr, es as dateFnsEs, de as dateFnsDe, sv as dateFnsSe, da as dateFnsDk, fi as dateFnsFi, nb as dateFnsNo } from 'date-fns/locale';
import type { Locale as DateFnsLocale } from 'date-fns';

export { t, tHtml, detectLocaleFromHost, isValidLocale, SUPPORTED_LOCALES, LOCALE_LABELS, LOCALE_NAMES, loadLocaleDict, isLocaleLoaded } from './core';
export type { Locale } from './core';
import type { Locale } from './core';
import { isValidLocale, t as coreTranslate, tHtml as coreTranslateHtml } from './core';
import { stripPlatformPrefix } from '@/lib/platform';

const LOCALE_STORAGE_KEY = 'tutlio_locale';

function getDomainStorageKey(): string {
  if (typeof window === 'undefined') return LOCALE_STORAGE_KEY;
  const host = window.location.hostname;
  if (host === 'tutlio.com' || host.endsWith('.tutlio.com')) return `${LOCALE_STORAGE_KEY}_com`;
  if (host === 'tutlio.lt' || host.endsWith('.tutlio.lt')) return `${LOCALE_STORAGE_KEY}_lt`;
  if (host === 'tutlio.pl' || host.endsWith('.tutlio.pl')) return `${LOCALE_STORAGE_KEY}_pl`;
  return LOCALE_STORAGE_KEY;
}

/** Default UI locale per host — mirrors getDefaultLocale in api/_lib/seo-routing.ts. */
export function defaultLocaleForHost(host: string): Locale {
  if (host === 'tutlio.com' || host.endsWith('.tutlio.com')) return 'en';
  if (host === 'tutlio.pl' || host.endsWith('.tutlio.pl')) return 'pl';
  return 'lt';
}

export function getStoredLocale(): Locale | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(getDomainStorageKey());
  if (stored && isValidLocale(stored)) return stored;
  return null;
}

export function storeLocale(locale: Locale): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(getDomainStorageKey(), locale);
}

export function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'lt';

  const host = window.location.hostname;
  // tutlio.pl is Polish-only — ignore path, query, and stored prefs.
  if (host === 'tutlio.pl' || host.endsWith('.tutlio.pl')) return 'pl';

  const stripped = stripPlatformPrefix(window.location.pathname);
  const pathLocale = getLocaleFromPathname(stripped);
  if (pathLocale) return pathLocale;

  const params = new URLSearchParams(window.location.search);
  const langOverride = params.get('lang');
  if (langOverride && isValidLocale(langOverride)) return langOverride;

  // On tutlio.com, default to English. Stored preference only applies on .lt.
  const domainDefault = defaultLocaleForHost(host);
  if (domainDefault !== 'lt') return domainDefault;

  const stored = getStoredLocale();
  if (stored) return stored;
  return 'lt';
}

/**
 * Canonical slug for pages with domain-flavored paths — Lithuanian slugs for
 * the lt locale, English everywhere else. Mirrors localizedPagePath() in
 * api/_lib/seo-routing.ts (sync enforced by tests/lib/seo-visibility.test.ts).
 */
export function localizedPagePath(page: 'about' | 'contacts', locale: Locale): string {
  if (page === 'about') return locale === 'lt' ? '/apie-mus' : '/about';
  return locale === 'lt' ? '/kontaktai' : '/contacts';
}

export function getLocaleFromPathname(pathname: string): Locale | null {
  const [firstSegment] = pathname.split('/').filter(Boolean);
  if (firstSegment && isValidLocale(firstSegment)) {
    return firstSegment;
  }
  return null;
}

export function stripLocalePrefix(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length > 0 && isValidLocale(segments[0])) {
    const rest = segments.slice(1).join('/');
    return rest ? `/${rest}` : '/';
  }
  return pathname || '/';
}

export function buildLocalizedPath(pathname: string, locale: Locale, host?: string): string {
  const normalized = stripLocalePrefix(pathname);
  const effectiveHost = host ?? (typeof window !== 'undefined' ? window.location.hostname : 'localhost');
  const defaultLocale = defaultLocaleForHost(effectiveHost);

  if (locale === defaultLocale) {
    return normalized;
  }

  if (normalized === '/') {
    return `/${locale}`;
  }

  return `/${locale}${normalized}`;
}

const dateFnsLocales: Record<Locale, DateFnsLocale | undefined> = {
  lt: dateFnsLt,
  en: undefined,
  pl: dateFnsPl,
  lv: dateFnsLv,
  ee: dateFnsEe,
  fr: dateFnsFr,
  es: dateFnsEs,
  de: dateFnsDe,
  se: dateFnsSe,
  dk: dateFnsDk,
  fi: dateFnsFi,
  no: dateFnsNo,
};

export function getDateFnsLocale(locale: Locale): DateFnsLocale | undefined {
  return dateFnsLocales[locale];
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  /** HTML-escaped interpolation — use for `dangerouslySetInnerHTML` sinks. */
  tHtml: (key: string, params?: Record<string, string | number>) => string;
  dateFnsLocale: DateFnsLocale | undefined;
}

export const I18nContext = createContext<I18nContextValue>({
  locale: 'lt',
  setLocale: () => {},
  t: (key) => key,
  tHtml: (key) => key,
  dateFnsLocale: dateFnsLt,
});

export function useTranslation() {
  const ctx = useContext(I18nContext);

  const safeT = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      const translated = ctx.t(key, params);
      if (translated !== key) return translated;
      return coreTranslate(ctx.locale, key, params);
    },
    [ctx.t, ctx.locale],
  );

  const safeTHtml = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      const translated = ctx.tHtml(key, params);
      if (translated !== key) return translated;
      return coreTranslateHtml(ctx.locale, key, params);
    },
    [ctx.tHtml, ctx.locale],
  );

  return {
    ...ctx,
    t: safeT,
    tHtml: safeTHtml,
  };
}
