import { useEffect } from 'react';
import { useUser } from '@/contexts/UserContext';
import { useTranslation, getLocaleFromPathname } from '@/lib/i18n';
import { isValidLocale } from '@/lib/i18n/core';
import { stripPlatformPrefix } from '@/lib/platform';
import { isPlMarket } from '@/lib/market';

// Explicit URL choices (/:locale/ prefix or ?lang=) always win over the stored preference.
function hasExplicitUrlLocale(): boolean {
  try {
    const stripped = stripPlatformPrefix(window.location.pathname);
    if (getLocaleFromPathname(stripped)) return true;
    const lang = new URLSearchParams(window.location.search).get('lang');
    return Boolean(lang);
  } catch {
    return false;
  }
}

// Apply at most once per page load, so a manual switch later in the session is never fought.
let appliedThisLoad = false;

/**
 * Applies profiles.preferred_locale to the UI once the signed-in profile arrives.
 * Without this the dashboard language is domain default + localStorage only —
 * e.g. tutlio.com always renders English even for org tutors who work in Lithuanian.
 */
export default function ProfileLocaleSync() {
  const { profile } = useUser();
  const { locale, setLocale } = useTranslation();

  useEffect(() => {
    if (appliedThisLoad || !profile) return;
    appliedThisLoad = true;
    if (isPlMarket()) return;
    if (hasExplicitUrlLocale()) return;
    const preferred = (profile.preferred_locale || '').trim();
    if (preferred && isValidLocale(preferred) && preferred !== locale) {
      setLocale(preferred);
    }
  }, [profile, locale, setLocale]);

  return null;
}
