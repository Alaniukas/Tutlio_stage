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
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('://')) return null;
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
): string {
  const trimmedWindow = String(windowOrigin || '').replace(/\/$/, '');
  // Naršyklėje visada naudoti tą patį host kaip puslapis (www / apex), kad nuoroda laiške
  // sutaptų su domeniu, kuriame vartotojas prisijungia – sumažina klaidų ir redirect grandines.
  if (typeof window !== 'undefined' && trimmedWindow) {
    return `${trimmedWindow}/auth/callback?next=/reset-password`;
  }
  return `${getAppOrigin(viteAppUrl, windowOrigin)}/auth/callback?next=/reset-password`;
}
