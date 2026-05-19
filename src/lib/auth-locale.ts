/** Auth el. laiškų kalba pagal domeną (vienas Supabase projektas, .lt / .pl / .com). */
export type AuthEmailLocale = 'lt' | 'pl' | 'en';

export function detectAuthLocaleFromHost(host?: string): AuthEmailLocale {
  const h = String(host || (typeof window !== 'undefined' ? window.location.hostname : ''))
    .toLowerCase()
    .replace(/^www\./, '');

  if (h.endsWith('.pl') || h === 'tutlio.pl') return 'pl';
  if (h.endsWith('.com') || h === 'tutlio.com') return 'en';
  return 'lt';
}

export function getAuthEmailOrigin(viteAppUrl: string | undefined, windowOrigin: string): string {
  if (typeof window !== 'undefined' && windowOrigin) {
    return String(windowOrigin).replace(/\/$/, '');
  }
  return String(viteAppUrl || windowOrigin || 'https://tutlio.lt').replace(/\/$/, '');
}
