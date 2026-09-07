import { useEffect, useRef } from 'react';
import { useUser } from '@/contexts/UserContext';
import { useTranslation, getLocaleFromPathname, getStoredLocale } from '@/lib/i18n';
import { isValidLocale } from '@/lib/i18n/core';
import { stripPlatformPrefix } from '@/lib/platform';
import { isPlMarket } from '@/lib/market';

// Explicit URL choices (/:locale/ prefix or ?lang=) always win over the stored preference.
function explicitUrlLocale() {
  try {
    const stripped = stripPlatformPrefix(window.location.pathname);
    const pathLocale = getLocaleFromPathname(stripped);
    if (pathLocale) return pathLocale;
    const lang = new URLSearchParams(window.location.search).get('lang');
    return lang && isValidLocale(lang) ? lang : null;
  } catch {
    return null;
  }
}

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
  const { locale, requestedLocale = locale, setLocale } = useTranslation();
  const appliedProfile = useRef<string | null>(null);

  useEffect(() => {
    if (!profile) {
      appliedProfile.current = null;
      return;
    }
    if (appliedProfile.current === profile.id) return;
    appliedProfile.current = profile.id;
    if (isPlMarket()) return;
    const preferred = (profile.preferred_locale || '').trim();
    // A choice made before signing in must also reach the newly loaded profile.
    const explicit = explicitUrlLocale() || (isComHost() ? getStoredLocale() : null);
    if (explicit) {
      if (preferred !== explicit) setLocale(explicit);
      return;
    }
    if (isLtHost()) return;
    if (preferred && isValidLocale(preferred) && preferred !== requestedLocale) {
      setLocale(preferred);
    }
  }, [profile, requestedLocale, setLocale]);

  return null;
}
