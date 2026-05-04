import { createContext, useCallback, useContext } from 'react';
import { lt as dateFnsLt, pl as dateFnsPl, lv as dateFnsLv, et as dateFnsEe } from 'date-fns/locale';
import type { Locale as DateFnsLocale } from 'date-fns';

export { t, detectLocaleFromHost, isValidLocale, SUPPORTED_LOCALES, LOCALE_LABELS, LOCALE_NAMES } from './core';
export type { Locale } from './core';
import type { Locale } from './core';
import { isValidLocale, t as coreTranslate } from './core';
import { stripPlatformPrefix } from '@/lib/platform';

const LOCALE_STORAGE_KEY = 'tutlio_locale';

function getDomainStorageKey(): string {
  if (typeof window === 'undefined') return LOCALE_STORAGE_KEY;
  const host = window.location.hostname;
  if (host === 'tutlio.com' || host.endsWith('.tutlio.com')) return `${LOCALE_STORAGE_KEY}_com`;
  if (host === 'tutlio.lt' || host.endsWith('.tutlio.lt')) return `${LOCALE_STORAGE_KEY}_lt`;
  return LOCALE_STORAGE_KEY;
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

  const stripped = stripPlatformPrefix(window.location.pathname);
  const pathLocale = getLocaleFromPathname(stripped);
  if (pathLocale) return pathLocale;

  const stored = getStoredLocale();
  if (stored) return stored;

  const params = new URLSearchParams(window.location.search);
  const langOverride = params.get('lang');
  if (langOverride && isValidLocale(langOverride)) return langOverride;

  const host = window.location.hostname;
  if (host === 'tutlio.com' || host.endsWith('.tutlio.com')) return 'en';
  return 'lt';
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
  const defaultLocale = effectiveHost === 'tutlio.com' || effectiveHost.endsWith('.tutlio.com') ? 'en' : 'lt';

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
};

export function getDateFnsLocale(locale: Locale): DateFnsLocale | undefined {
  return dateFnsLocales[locale];
}

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
  dateFnsLocale: DateFnsLocale | undefined;
}

export const I18nContext = createContext<I18nContextValue>({
  locale: 'lt',
  setLocale: () => {},
  t: (key) => key,
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

  return {
    ...ctx,
    t: safeT,
  };
}
