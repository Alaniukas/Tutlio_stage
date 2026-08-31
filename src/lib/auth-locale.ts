import { SUPPORTED_LOCALES, type Locale } from './i18n/locales.js';

export type AuthEmailLocale = Locale;

export function detectAuthLocaleFromHost(host?: string): AuthEmailLocale {
  const h = String(host || (typeof window !== 'undefined' ? window.location.hostname : ''))
    .toLowerCase()
    .replace(/^www\./, '');

  if (h.endsWith('.pl') || h === 'tutlio.pl') return 'pl';
  if (h.endsWith('.com') || h === 'tutlio.com') return 'en';
  return 'lt';
}

/** Honor the selected UI language, while keeping tutlio.pl Polish-only.
 * This is presentation metadata only, never an authorization claim. */
export function resolveAuthEmailLocale(preferred: unknown, host?: string): AuthEmailLocale {
  const h = String(host ?? (typeof window !== 'undefined' ? window.location.hostname : ''))
    .toLowerCase().split(':')[0];
  if (h === 'tutlio.pl' || h.endsWith('.tutlio.pl')) return 'pl';
  if (typeof preferred === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(preferred)) {
    return preferred as AuthEmailLocale;
  }
  return detectAuthLocaleFromHost(h);
}

export function getAuthEmailOrigin(viteAppUrl: string | undefined, windowOrigin: string): string {
  if (typeof window !== 'undefined' && windowOrigin) {
    return String(windowOrigin).replace(/\/$/, '');
  }
  return String(viteAppUrl || windowOrigin || 'https://tutlio.lt').replace(/\/$/, '');
}
