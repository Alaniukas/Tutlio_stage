/**
 * Kanoninis app origin (be trailing slash) – sutampa su Supabase Site URL / VITE_APP_URL.
 */
export function getAppOrigin(viteAppUrl: string | undefined, windowOrigin: string): string {
  return String(viteAppUrl || windowOrigin).replace(/\/$/, '');
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
