import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  I18nContext,
  detectLocale,
  storeLocale,
  t as translate,
  tHtml as translateHtml,
  getDateFnsLocale,
  type Locale,
} from '@/lib/i18n';
import { htmlLanguageCode, localeDirection, LOCALE_NAMES } from '@/lib/i18n/locales';
import { supabase } from '@/lib/supabase';
import { usePlatform } from '@/contexts/PlatformContext';
import { persistProfileLocale } from '@/lib/localePreference';
import Toast from '@/components/Toast';
import { applyDefaultDocumentMeta, applyLocalePublicationMeta } from '@/lib/documentMeta';
import { isPlMarket } from '@/lib/market';
import { useLocaleDictionary } from '@/hooks/useLocaleDictionary';
import LocaleLoadStatus from '@/components/LocaleLoadStatus';

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { platform } = usePlatform();
  const [requestedLocale, setLocaleState] = useState<Locale>(detectLocale);
  const dictionary = useLocaleDictionary(requestedLocale);
  const locale = dictionary.activeLocale ?? requestedLocale;
  const [saveFailed, setSaveFailed] = useState(false);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const saveVersion = useRef(0);
  const dismissSaveError = useCallback(() => setSaveFailed(false), []);

  useLayoutEffect(() => {
    document.documentElement.lang = htmlLanguageCode(locale);
    document.documentElement.dir = localeDirection(locale);
    if (dictionary.activeLocale) applyDefaultDocumentMeta(locale, platform);
  }, [locale, platform, dictionary.activeLocale]);

  useLayoutEffect(() => {
    // RouteSync is not mounted during a cold load. Draft recovery screens must
    // still be noindex while their dictionary is unavailable.
    if (!dictionary.activeLocale) return applyLocalePublicationMeta(requestedLocale, window.location.pathname);
  }, [requestedLocale, dictionary.activeLocale]);

  const setLocale = useCallback((next: Locale) => {
    if (isPlMarket()) return;
    storeLocale(next);
    setLocaleState(next);
    setSaveFailed(false);
    const version = ++saveVersion.current;
    // Serialize writes so a slower previous selection cannot overwrite the latest.
    // Browser selection remains usable even when preference storage is unavailable.
    saveQueue.current = persistProfileLocale(supabase, next, saveQueue.current).catch(() => {
      console.error('[locale] Account preference could not be saved', { locale: next });
      if (version === saveVersion.current) setSaveFailed(true);
    });
  }, []);

  const value = useMemo(() => ({
    locale,
    requestedLocale,
    setLocale,
    t: (key: string, params?: Record<string, string | number>) => translate(locale, key, params, platform),
    tHtml: (key: string, params?: Record<string, string | number>) => translateHtml(locale, key, params, platform),
    dateFnsLocale: getDateFnsLocale(locale),
  }), [locale, requestedLocale, setLocale, platform]);

  return <I18nContext.Provider value={value}>
    {dictionary.activeLocale && children}
    {!dictionary.ready && <LocaleLoadStatus locale={requestedLocale} failed={dictionary.failed}
      retry={dictionary.retry} compact={Boolean(dictionary.activeLocale)} warnBeforeReload={Boolean(dictionary.activeLocale)} />}
    {saveFailed && <Toast
      type="error"
      message={`${translate(locale, 'common.saveFailed')}: ${LOCALE_NAMES[requestedLocale]}`}
      onClose={dismissSaveError}
    />}
  </I18nContext.Provider>;
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
  const dictionary = useLocaleDictionary(locale);

  const value = useMemo(() => ({
    locale,
    setLocale: () => {},
    t: (key: string, params?: Record<string, string | number>) => translate(locale, key, params, platform),
    tHtml: (key: string, params?: Record<string, string | number>) => translateHtml(locale, key, params, platform),
    dateFnsLocale: getDateFnsLocale(locale),
  }), [locale, platform]);

  if (!dictionary.ready) {
    return <LocaleLoadStatus locale={locale} failed={dictionary.failed} retry={dictionary.retry} />;
  }

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
