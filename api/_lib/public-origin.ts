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
    const host = new URL(origin).hostname;
    if (host === 'tutlio.com' || host.endsWith('.tutlio.com')) return 'en';
  } catch {
    /* ignore */
  }
  return 'lt';
}
