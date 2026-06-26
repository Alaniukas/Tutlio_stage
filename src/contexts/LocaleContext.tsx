import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import {
  I18nContext,
  detectLocale,
  storeLocale,
  getStoredLocale,
  getLocaleFromPathname,
  t as translate,
  tHtml as translateHtml,
  getDateFnsLocale,
  loadLocaleDict,
  isLocaleLoaded,
  type Locale,
} from '@/lib/i18n';
import { isValidLocale } from '@/lib/i18n/core';
import { supabase } from '@/lib/supabase';
import { usePlatform } from '@/contexts/PlatformContext';
import { stripPlatformPrefix } from '@/lib/platform';
import { applyDefaultDocumentMeta } from '@/lib/documentMeta';
import { isPlMarket } from '@/lib/market';

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { platform } = usePlatform();
  const [locale, setLocaleState] = useState<Locale>(detectLocale);
  // Bumped when a lazy-loaded dictionary arrives so consumers re-render
  // with the real translations instead of the en/lt fallback.
  const [dictVersion, setDictVersion] = useState(0);

  useEffect(() => {
    if (isLocaleLoaded(locale)) return;
    let cancelled = false;
    void loadLocaleDict(locale).then(() => {
      if (!cancelled) setDictVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [locale]);

  useLayoutEffect(() => {
    document.documentElement.lang = locale;
    applyDefaultDocumentMeta(locale, platform);
  }, [locale, platform, dictVersion]);

  const setLocale = useCallback((next: Locale) => {
    if (isPlMarket()) return;
    storeLocale(next);
    setLocaleState(next);
    // Best-effort DB sync without blocking UI/auth flows.
    void supabase.auth.getSession().then(({ data }) => {
      const userId = data?.session?.user?.id;
      if (!userId) return;
      return supabase
        .from('profiles')
        .update({ preferred_locale: next })
        .eq('id', userId);
    }).catch(() => {});
  }, []);

  const value = useMemo(() => ({
    locale,
    setLocale,
    t: (key: string, params?: Record<string, string | number>) => translate(locale, key, params, platform),
    tHtml: (key: string, params?: Record<string, string | number>) => translateHtml(locale, key, params, platform),
    dateFnsLocale: getDateFnsLocale(locale),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dictVersion invalidates t/tHtml closures
  }), [locale, setLocale, platform, dictVersion]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Forces a fixed UI locale for a subtree, ignoring the domain's market locale.
 * Used for the platform `/admin` area, which must always render in Lithuanian so
 * the (Lithuanian) team can read it even on tutlio.pl (Polish) / tutlio.com (English).
 * Side-effect free (no document.lang / SEO meta writes, no persistence) so it nests
 * safely inside the top-level LocaleProvider. Relies on lt/en/pl being bundled, so
 * no async dictionary load is needed for those.
 */
export function StaticLocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const { platform } = usePlatform();

  const value = useMemo(() => ({
    locale,
    setLocale: () => {},
    t: (key: string, params?: Record<string, string | number>) => translate(locale, key, params, platform),
    tHtml: (key: string, params?: Record<string, string | number>) => translateHtml(locale, key, params, platform),
    dateFnsLocale: getDateFnsLocale(locale),
  }), [locale, platform]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
