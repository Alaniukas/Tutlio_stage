/** tutlio.pl vs tutlio.lt / tutlio.com — same app, market-specific pricing & copy. */
export type TutlioMarket = 'pl' | 'default';

export function marketFromHost(host: string): TutlioMarket {
  const h = host.toLowerCase().replace(/^www\./, '');
  if (h === 'tutlio.pl' || h.endsWith('.tutlio.pl')) return 'pl';
  return 'default';
}

export function currentMarket(): TutlioMarket {
  if (typeof window === 'undefined') return 'default';
  return marketFromHost(window.location.hostname);
}

export function isPlMarket(): boolean {
  return currentMarket() === 'pl';
}

/** Apex hosts that edge-redirect (308) to their `www.` host as the canonical origin. */
const WWW_CANONICAL_APEX_HOSTS = new Set(['tutlio.pl', 'tutlio.lt', 'tutlio.com']);

/**
 * Each apex domain 308-redirects to `www.` at the edge, but a PWA service worker
 * cached on the apex scope can serve the app shell on the apex origin without ever
 * hitting that redirect. The SPA then runs on apex and its relative `/api/*` calls
 * get 308'd cross-origin to `www`, triggering CORS preflights that 405 (admin login
 * and every authed write break). Returns the canonical `www` URL to bounce to, or
 * null when the host is already canonical / not one of ours (localhost, previews).
 */
export function canonicalHostRedirectUrl(href: string): string | null {
  try {
    const url = new URL(href);
    const host = url.hostname.toLowerCase();
    if (WWW_CANONICAL_APEX_HOSTS.has(host)) {
      url.hostname = `www.${host}`;
      return url.toString();
    }
  } catch {
    // Malformed href — nothing to redirect.
  }
  return null;
}
