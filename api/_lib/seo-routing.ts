import type { VercelRequest } from '../types';

export type Locale = 'lt' | 'en' | 'pl' | 'lv' | 'ee' | 'fr' | 'es' | 'de' | 'se' | 'dk' | 'fi' | 'no';
export const LOCALES: Locale[] = ['lt', 'en', 'pl', 'lv', 'ee', 'fr', 'es', 'de', 'se', 'dk', 'fi', 'no'];

const DOMAINS = {
  lt: 'https://www.tutlio.lt',
  com: 'https://www.tutlio.com',
} as const;

export type DomainKey = 'lt' | 'com';

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function detectDomain(req: VercelRequest): DomainKey {
  const host = (req.headers['x-forwarded-host'] as string) || (req.headers.host as string) || '';
  if (host.includes('tutlio.com')) return 'com';
  return 'lt';
}

export function getDefaultLocale(domain: DomainKey): Locale {
  return domain === 'com' ? 'en' : 'lt';
}

export function detectLocale(req: VercelRequest): Locale {
  const q = typeof req.query.locale === 'string' ? req.query.locale : '';
  if (LOCALES.includes(q as Locale)) return q as Locale;
  return getDefaultLocale(detectDomain(req));
}

export function buildPath(path: string, locale: Locale, domain: DomainKey): string {
  const defaultLocale = getDefaultLocale(domain);
  const normalizedPath = path === '/' ? '' : path;
  if (locale === defaultLocale) return normalizedPath || '/';
  return `/${locale}${normalizedPath}`;
}

export function buildFullUrl(path: string, locale: Locale, domain: DomainKey): string {
  const base = DOMAINS[domain];
  const built = buildPath(path, locale, domain);
  return `${base}${built}`;
}

export interface HreflangLink {
  lang: string;
  href: string;
}

export function canonicalDomain(locale: Locale): DomainKey {
  return locale === 'lt' ? 'lt' : 'com';
}

export function buildCanonicalUrl(path: string, locale: Locale): string {
  return buildFullUrl(path, locale, canonicalDomain(locale));
}

export function generateHreflangLinks(path: string): HreflangLink[] {
  const links: HreflangLink[] = [];

  for (const locale of LOCALES) {
    links.push({ lang: locale, href: buildCanonicalUrl(path, locale) });
  }

  links.push({ lang: 'x-default', href: buildFullUrl(path, 'en', 'com') });
  return links;
}

export function hreflangTags(path: string): string {
  const links = generateHreflangLinks(path);
  const seen = new Set<string>();
  return links
    .filter((l) => {
      const key = `${l.lang}:${l.href}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((l) => `<link rel="alternate" hreflang="${l.lang}" href="${esc(l.href)}" />`)
    .join('\n');
}
