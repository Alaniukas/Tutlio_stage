import { useEffect } from 'react';
import { useUser } from '@/contexts/UserContext';
import { useTranslation, getLocaleFromPathname, getStoredLocale } from '@/lib/i18n';
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

function isLtHost(): boolean {
  try {
    const host = window.location.hostname;
    return host === 'tutlio.lt' || host.endsWith('.tutlio.lt');
  } catch {
    return false;
  }
}

function isComHost(): boolean {
  try {
    const host = window.location.hostname;
    return host === 'tutlio.com' || host.endsWith('.tutlio.com');
  } catch {
    return false;
  }
}

/**
 * Applies profiles.preferred_locale when no stronger signal exists (URL prefix,
 * ?lang=, localStorage from landing/settings). tutlio.lt is always Lithuanian;
 * tutlio.com follows the visitor's stored landing choice, not org-seeded profile locale.
 */
export default function ProfileLocaleSync() {
  const { profile } = useUser();
  const { locale, setLocale } = useTranslation();

  useEffect(() => {
    if (appliedThisLoad || !profile) return;
    appliedThisLoad = true;
    if (isPlMarket()) return;
    if (hasExplicitUrlLocale()) return;
    if (isLtHost()) return;
    if (isComHost() && getStoredLocale()) return;
    const preferred = (profile.preferred_locale || '').trim();
    if (preferred && isValidLocale(preferred) && preferred !== locale) {
      setLocale(preferred);
    }
  }, [profile, locale, setLocale]);

  return null;
}
