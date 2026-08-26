import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import {
  I18nContext,
  detectLocale,
  storeLocale,
  getDateFnsLocale,
  type Locale,
} from '@/lib/i18n';
import {
  htmlLanguageCode,
  t as translate,
  tHtml as translateHtml,
  loadLocaleDict,
  isLocaleLoaded,
  invalidateLocaleCache,
} from '@/lib/i18n/core';
import { supabase } from '@/lib/supabase';
import { usePlatform } from '@/contexts/PlatformContext';
import { applyDefaultDocumentMeta } from '@/lib/documentMeta';
import { isPlMarket } from '@/lib/market';

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { platform } = usePlatform();
  const [locale, setLocaleState] = useState<Locale>(detectLocale);
  // Bumped when a lazy-loaded dictionary arrives so consumers re-render
  // with the real translations instead of the en/lt fallback.
  const [dictVersion, setDictVersion] = useState(0);
  const ready = isLocaleLoaded(locale);

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    void loadLocaleDict(locale)
      .then(() => {
        if (!cancelled) setDictVersion((v) => v + 1);
      })
      .catch((err) => {
        console.error('[i18n] failed to load locale dictionary', locale, err);
      });
    return () => {
      cancelled = true;
    };
  }, [locale, ready]);

  // Vite HMR clears the in-memory dictionary cache without remounting React.
  useEffect(() => {
    const reload = () => {
      invalidateLocaleCache(locale);
      void loadLocaleDict(locale).then(() => setDictVersion((v) => v + 1));
    };
    window.addEventListener('tutlio:locale-cache-invalidate', reload);
    return () => window.removeEventListener('tutlio:locale-cache-invalidate', reload);
  }, [locale]);

  useLayoutEffect(() => {
    document.documentElement.lang = htmlLanguageCode(locale);
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

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Loading" />;
  }

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * Forces a fixed UI locale for a subtree, ignoring the domain's market locale.
 * Used for the platform `/admin` area, which must always render in Lithuanian so
 * the (Lithuanian) team can read it even on tutlio.pl (Polish) / tutlio.com (English).
 * Side-effect free (no document.lang / SEO meta writes, no persistence) so it nests
 * safely inside the top-level LocaleProvider. Its fixed dictionary is loaded only
 * when this subtree is actually reached (notably the Lithuanian admin UI).
 */
export function StaticLocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const { platform } = usePlatform();
  const [dictVersion, setDictVersion] = useState(0);
  const ready = isLocaleLoaded(locale);

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    void loadLocaleDict(locale).then(() => {
      if (!cancelled) setDictVersion((v) => v + 1);
    });
    return () => { cancelled = true; };
  }, [locale, ready]);

  useEffect(() => {
    const reload = () => {
      invalidateLocaleCache(locale);
      void loadLocaleDict(locale).then(() => setDictVersion((v) => v + 1));
    };
    window.addEventListener('tutlio:locale-cache-invalidate', reload);
    return () => window.removeEventListener('tutlio:locale-cache-invalidate', reload);
  }, [locale]);

  const value = useMemo(() => ({
    locale,
    setLocale: () => {},
    t: (key: string, params?: Record<string, string | number>) => translate(locale, key, params, platform),
    tHtml: (key: string, params?: Record<string, string | number>) => translateHtml(locale, key, params, platform),
    dateFnsLocale: getDateFnsLocale(locale),
  // dictVersion invalidates the translation closures after the lazy load.
  }), [locale, platform, dictVersion]);

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center" role="status" aria-label="Loading" />;
  }

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
