import { useCallback, useEffect, useState } from 'react';
import { isLocaleLoaded, loadLocaleDict, type Locale } from '@/lib/i18n';

/** Keep the last working dictionary while a replacement downloads. Never remount
 * the application or let an obsolete request replace a newer language choice. */
export function useLocaleDictionary(locale: Locale) {
  const [lastReady, setLastReady] = useState<Locale | null>(() => isLocaleLoaded(locale) ? locale : null);
  const [failedLocale, setFailedLocale] = useState<Locale | null>(null);
  const [attempt, setAttempt] = useState(0);
  const ready = isLocaleLoaded(locale);

  useEffect(() => {
    if (ready) {
      setLastReady(locale);
      return;
    }
    let cancelled = false;
    setFailedLocale(null);
    void loadLocaleDict(locale).then(() => {
      if (!cancelled) setLastReady(locale);
    }).catch(() => {
      if (!cancelled) setFailedLocale(locale);
    });
    return () => { cancelled = true; };
  }, [locale, ready, attempt]);

  const retry = useCallback(() => {
    setFailedLocale(null);
    setAttempt((value) => value + 1);
  }, []);

  return { ready, activeLocale: ready ? locale : lastReady, failed: !ready && failedLocale === locale, retry };
}
