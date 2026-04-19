import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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

export function LocaleProvider({ children }: { children: ReactNode }) {
  const { platform } = usePlatform();
  const [locale, setLocaleState] = useState<Locale>(detectLocale);
  const dbSyncedRef = useRef(false);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  useEffect(() => {
    let cancelled = false;

    const syncLocaleFromDb = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled || !user) return;

        const { data } = await supabase
          .from('profiles')
          .select('preferred_locale')
          .eq('id', user.id)
          .maybeSingle();

        if (cancelled) return;

        const dbLocale = data?.preferred_locale;
        const storedLocale = getStoredLocale();
        const pathLocale = typeof window !== 'undefined'
          ? getLocaleFromPathname(stripPlatformPrefix(window.location.pathname))
          : null;
        const preferredLocale = pathLocale ?? storedLocale;

        if (dbLocale && isValidLocale(dbLocale)) {
          if (!preferredLocale) {
            storeLocale(dbLocale);
            setLocaleState(dbLocale);
          } else if (preferredLocale !== dbLocale) {
            // explicit URL locale / localStorage takes priority — push it to DB
            if (pathLocale) {
              setLocaleState(pathLocale);
              storeLocale(pathLocale);
            }
            supabase
              .from('profiles')
              .update({ preferred_locale: preferredLocale })
              .eq('id', user.id)
              .then(() => {});
          }
        } else if (preferredLocale) {
          // DB has no locale yet — persist current choice
          if (pathLocale) {
            setLocaleState(pathLocale);
            storeLocale(pathLocale);
          }
          supabase
            .from('profiles')
            .update({ preferred_locale: preferredLocale })
            .eq('id', user.id)
            .then(() => {});
        }

        dbSyncedRef.current = true;
      } catch {
        // non-critical
      }
    };

    syncLocaleFromDb();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        dbSyncedRef.current = false;
        syncLocaleFromDb();
      }
      if (event === 'SIGNED_OUT') {
        dbSyncedRef.current = false;
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const setLocale = useCallback((next: Locale) => {
    storeLocale(next);
    setLocaleState(next);

    // Fire-and-forget DB update
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from('profiles')
        .update({ preferred_locale: next })
        .eq('id', user.id)
        .then(() => {});
    });
  }, []);

  const value = useMemo(() => ({
    locale,
    setLocale,
    t: (key: string, params?: Record<string, string | number>) => translate(locale, key, params, platform),
    dateFnsLocale: getDateFnsLocale(locale),
  }), [locale, setLocale, platform]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
