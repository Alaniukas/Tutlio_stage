import { useCallback, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import {
  I18nContext,
  detectLocale,
  storeLocale,
  getStoredLocale,
  getLocaleFromPathname,
  t as translate,
  getDateFnsLocale,
  type Locale,
} from '@/lib/i18n';
import { isValidLocale } from '@/lib/i18n/core';
import { supabase } from '@/lib/supabase';
import { usePlatform } from '@/contexts/PlatformContext';
import { stripPlatformPrefix } from '@/lib/platform';
import { applyDefaultDocumentMeta } from '@/lib/documentMeta';

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { platform } = usePlatform();
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  useLayoutEffect(() => {
    document.documentElement.lang = locale;
    applyDefaultDocumentMeta(locale, platform);
  }, [locale, platform]);

  const setLocale = useCallback((next: Locale) => {
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
    dateFnsLocale: getDateFnsLocale(locale),
  }), [locale, setLocale, platform]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
