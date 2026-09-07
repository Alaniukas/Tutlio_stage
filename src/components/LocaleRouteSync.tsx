import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getLocaleFromPathname, isValidLocale, useTranslation } from '@/lib/i18n';
import { getPlatformBasename, stripPlatformPrefix } from '@/lib/platform';
import { usePlatform } from '@/contexts/PlatformContext';
import { isPlMarket } from '@/lib/market';
import { initAnalytics, trackPageview } from '@/lib/analytics';
import { applyLocalePublicationMeta } from '@/lib/documentMeta';

/** Keep language and publication rules aligned with path/query navigation. */
export default function LocaleRouteSync() {
  const location = useLocation();
  const { locale, requestedLocale = locale, setLocale } = useTranslation();
  const { platform } = usePlatform();

  useEffect(() => { initAnalytics(); }, []);
  useEffect(() => { trackPageview(location.pathname); }, [location.pathname]);

  useEffect(() => {
    if (isPlMarket()) return;
    const pathLocale = getLocaleFromPathname(stripPlatformPrefix(location.pathname));
    const queryLocale = new URLSearchParams(location.search).get('lang');
    const next = pathLocale || (queryLocale && isValidLocale(queryLocale) ? queryLocale : null);
    if (next && next !== requestedLocale) setLocale(next);
  }, [location.pathname, location.search, requestedLocale, setLocale]);

  // Router locations omit the basename (e.g. /schools). Keep it when deciding
  // which surface can be indexed so marketing release cannot publish schools.
  useEffect(() => applyLocalePublicationMeta(requestedLocale, getPlatformBasename(platform) + location.pathname), [requestedLocale, location.pathname, platform]);
  return null;
}
