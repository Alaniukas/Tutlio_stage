import type { Locale } from './i18n/locales';

/**
 * Kanoninis app origin (be trailing slash) – sutampa su Supabase Site URL / VITE_APP_URL.
 */
export function getAppOrigin(viteAppUrl: string | undefined, windowOrigin: string): string {
  return String(viteAppUrl || windowOrigin).replace(/\/$/, '');
}

/** Only same-origin relative paths (blocks open redirects). */
export function safeInternalNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let path = String(raw).trim();
  try {
    // Gmail / clients sometimes double-encode query values.
    if (path.includes('%')) path = decodeURIComponent(path);
  } catch {
    // keep raw
  }
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://') || /[\\\u0000-\u001f\u007f]/.test(path)) return null;
  return path;
}

export function loginHrefWithNext(nextPath: string): string {
  const safe = safeInternalNextPath(nextPath);
  if (!safe) return '/login';
  return `/login?next=${encodeURIComponent(safe)}`;
}

/** redirect_to slaptažodžio atkūrimo el. laiške – per /auth/callback į /reset-password. */
export function getPasswordResetRedirectTo(
  viteAppUrl: string | undefined,
  windowOrigin: string,
  locale?: Locale,
): string {
  const trimmedWindow = String(windowOrigin || '').replace(/\/$/, '');
  // Naršyklėje visada naudoti tą patį host kaip puslapis (www / apex), kad nuoroda laiške
  // sutaptų su domeniu, kuriame vartotojas prisijungia – sumažina klaidų ir redirect grandines.
  if (typeof window !== 'undefined' && trimmedWindow) {
    return `${trimmedWindow}/auth/callback?next=/reset-password${locale ? `&lang=${locale}` : ''}`;
  }
  return `${getAppOrigin(viteAppUrl, windowOrigin)}/auth/callback?next=/reset-password${locale ? `&lang=${locale}` : ''}`;
}

/** Preserve the email's language on a different browser/device, without changing
 * the callback path already registered in Supabase's redirect allowlist. */
export function authDestinationWithLocale(path: string, locale?: Locale): string {
  const safePath = safeInternalNextPath(path) ?? '/login';
  if (!locale) return safePath;
  const url = new URL(safePath, 'https://tutlio.invalid');
  url.searchParams.set('lang', locale);
  return `${url.pathname}${url.search}${url.hash}`;
}
