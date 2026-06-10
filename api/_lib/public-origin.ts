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

const TRUSTED_REDIRECT_HOSTS = ['tutlio.lt', 'tutlio.com', 'tutlio.pl'];

/**
 * Open-redirect guard for caller-supplied redirect URLs (e.g. password reset).
 * Accepts only http(s) URLs whose host is a trusted Tutlio domain, the
 * configured APP_URL origin, the origin serving this request (covers preview
 * deployments), or localhost for development.
 */
export function isAllowedRedirectUrl(redirectTo: string, requestOrigin?: string): boolean {
  let url: URL;
  try {
    url = new URL(redirectTo);
  } catch {
    return false;
  }

  const host = url.hostname.toLowerCase();

  if (url.protocol === 'http:') {
    // Plain http only for local development.
    return host === 'localhost' || host === '127.0.0.1';
  }
  if (url.protocol !== 'https:') return false;

  if (TRUSTED_REDIRECT_HOSTS.some((t) => host === t || host.endsWith(`.${t}`))) return true;

  const candidates = [process.env.APP_URL, process.env.VITE_APP_URL, requestOrigin];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (new URL(candidate).hostname.toLowerCase() === host) return true;
    } catch {
      /* ignore malformed env/origin */
    }
  }

  return false;
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

export type CheckoutAudience = 'tutor' | 'schools';

/** Platform + locale aware path (e.g. /schools/en/pricing) for checkout redirect URLs. */
export function buildPublicPath(
  pathname: string,
  locale: string | undefined,
  audience: CheckoutAudience,
  appOrigin: string,
): string {
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  const platformPrefix = audience === 'schools' ? '/schools' : '';
  const defaultLocale = defaultLocaleForOrigin(appOrigin);
  const localeSeg = locale && locale !== defaultLocale ? `/${locale}` : '';
  return `${platformPrefix}${localeSeg}${normalized}`;
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
