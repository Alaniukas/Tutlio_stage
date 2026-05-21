import type { VercelRequest } from '../types.js';

export function headerFirst(req: VercelRequest, name: string): string {
  const v = req.headers?.[name];
  if (typeof v === 'string') return v.split(',')[0].trim();
  if (Array.isArray(v) && v[0]) return String(v[0]).split(',')[0].trim();
  return '';
}

/** Browser origin (tutlio.com vs tutlio.lt). Prefer request host over APP_URL. */
export function publicOriginFromRequest(req: VercelRequest): string {
  const fwdHost = headerFirst(req, 'x-forwarded-host');
  let hostRaw = (fwdHost || headerFirst(req, 'host')).trim();

  if (!hostRaw && process.env.TUTLIO_DEV_API_LOCAL === '1') {
    hostRaw = 'localhost:3000';
  }

  if (hostRaw) {
    if (/^localhost:3002$/i.test(hostRaw) || /^127\.0\.0\.1:3002$/i.test(hostRaw)) {
      hostRaw = hostRaw.replace(/:3002$/i, ':3000');
    }
    let proto = headerFirst(req, 'x-forwarded-proto').toLowerCase();
    if (proto !== 'http' && proto !== 'https') {
      proto =
        hostRaw.includes('localhost') || hostRaw.startsWith('127.') ? 'http' : 'https';
    }
    return `${proto}://${hostRaw}`.replace(/\/$/, '');
  }

  return (process.env.APP_URL || process.env.VITE_APP_URL || 'http://localhost:3000').replace(
    /\/$/,
    '',
  );
}

export function defaultLocaleForOrigin(origin: string): string {
  try {
    const host = new URL(origin).hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'tutlio.com' || host.endsWith('.tutlio.com')) return 'en';
    if (host === 'tutlio.pl' || host.endsWith('.tutlio.pl')) return 'pl';
  } catch {
    /* ignore */
  }
  return 'lt';
}

const VALID_LOCALES = new Set(['lt','en','pl','lv','ee','fr','es','de','se','dk','fi','no']);

/** Resolve the email copy locale from the UI locale + request origin. */
export function inviteEmailLocale(uiLocale: string | undefined, origin: string): string {
  if (uiLocale && VALID_LOCALES.has(uiLocale)) return uiLocale;
  return defaultLocaleForOrigin(origin);
}

/** Full public URL with optional locale prefix (e.g. tutlio.com/parent-register vs /en/...). */
export function buildPublicAppUrl(
  origin: string,
  pathname: string,
  opts?: { locale?: string; searchParams?: Record<string, string> },
): string {
  const base = origin.replace(/\/$/, '');
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const defaultLocale = defaultLocaleForOrigin(origin);
  const loc = (opts?.locale || defaultLocale).trim();
  const prefix = loc && loc !== defaultLocale ? `/${loc}` : '';
  const url = new URL(`${base}${prefix}${path}`);
  if (opts?.searchParams) {
    for (const [k, v] of Object.entries(opts.searchParams)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, v);
    }
  }
  return url.toString();
}

export function publicHostLabel(origin: string): string {
  try {
    return new URL(origin).host;
  } catch {
    return 'tutlio.lt';
  }
}

/** Tutor org invite: /register?org_token=… with optional /{locale} prefix. */
export function buildTutorRegisterInviteUrl(
  origin: string,
  orgToken: string,
  opts?: { uiLocale?: string },
): string {
  return buildPublicAppUrl(origin, '/register', {
    locale: opts?.uiLocale,
    searchParams: { org_token: orgToken.trim() },
  });
}
