import type { VercelRequest } from '../types';

import { SUPPORTED_LOCALES, htmlLanguageCode, type Locale } from '../../src/lib/i18n/locales.js';
import { seoLocalesForPath } from '../../src/lib/i18n/localeRelease.js';
export { TRANSLATED_LOCALES } from '../../src/lib/i18n/locales.js';
export type { Locale } from '../../src/lib/i18n/locales.js';
export const LOCALES: Locale[] = [...SUPPORTED_LOCALES];

export function hreflangCode(locale: Locale): string {
  return htmlLanguageCode(locale);
}

const DOMAINS = {
  lt: 'https://www.tutlio.lt',
  com: 'https://www.tutlio.com',
  pl: 'https://www.tutlio.pl',
} as const;

export type DomainKey = 'lt' | 'com' | 'pl';

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function detectDomain(req: VercelRequest): DomainKey {
  const host = (req.headers['x-forwarded-host'] as string) || (req.headers.host as string) || '';
  if (host.includes('tutlio.com')) return 'com';
  if (host.includes('tutlio.pl')) return 'pl';
  return 'lt';
}

export function getDefaultLocale(domain: DomainKey): Locale {
  if (domain === 'com') return 'en';
  if (domain === 'pl') return 'pl';
  return 'lt';
}

export function detectLocale(req: VercelRequest): Locale {
  const domain = detectDomain(req);
  if (domain === 'pl') return 'pl';
  const q = typeof req.query.locale === 'string' ? req.query.locale : '';
  if (LOCALES.includes(q as Locale)) return q as Locale;
  return getDefaultLocale(domain);
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
  if (locale === 'lt') return 'lt';
  if (locale === 'pl') return 'pl';
  return 'com';
}

export function buildCanonicalUrl(path: string, locale: Locale): string {
  return buildFullUrl(path, locale, canonicalDomain(locale));
}

/**
 * Platform-prefixed URLs nest the locale after the prefix
 * (e.g. /schools/fr/pricing) — the plain builders would wrongly
 * produce /fr/schools/pricing.
 */
export function buildPlatformPath(prefix: string, path: string, locale: Locale, domain: DomainKey): string {
  const defaultLocale = getDefaultLocale(domain);
  const normalizedPath = path === '/' ? '' : path;
  const localeSeg = locale === defaultLocale ? '' : `/${locale}`;
  return `${prefix}${localeSeg}${normalizedPath}`;
}

export function buildPlatformCanonicalUrl(prefix: string, path: string, locale: Locale): string {
  const domain = canonicalDomain(locale);
  return `${DOMAINS[domain]}${buildPlatformPath(prefix, path, locale, domain)}`;
}

/** Public tutor/agency pages use the Lithuanian noun on .lt and the
 * international noun everywhere else. A public page has one authored locale,
 * so its locale also determines its one canonical domain and URL. */
export function publicPagePath(slug: string, locale: Locale, domain: DomainKey = canonicalDomain(locale)): string {
  const prefix = locale === 'lt' ? '/korepetitorius' : '/tutor';
  return buildPath(`${prefix}/${slug}`, locale, domain);
}

export function buildPublicPageCanonicalUrl(slug: string, locale: Locale): string {
  const domain = canonicalDomain(locale);
  return `${DOMAINS[domain]}${publicPagePath(slug, locale, domain)}`;
}

/**
 * Pages whose canonical slug is domain-flavored: the .lt domain keeps the
 * Lithuanian slugs, while the international domains use the English ones.
 * Both slug variants stay routable; the non-canonical one 308s in middleware.
 */
const LOCALIZED_PAGE_PATHS = {
  about: { lt: '/apie-mus', com: '/about', pl: '/about' },
  contacts: { lt: '/kontaktai', com: '/contacts', pl: '/contacts' },
} as const;

export type LocalizedPageId = keyof typeof LOCALIZED_PAGE_PATHS;

export function localizedPagePath(page: LocalizedPageId, locale: Locale): string {
  return LOCALIZED_PAGE_PATHS[page][canonicalDomain(locale)];
}

export function generateHreflangLinksFor(urlFor: (locale: Locale) => string): HreflangLink[] {
  const links: HreflangLink[] = [];
  const locales = seoLocalesForPath(new URL(urlFor('en')).pathname);
  for (const locale of locales) {
    links.push({ lang: hreflangCode(locale), href: urlFor(locale) });
  }

  if (locales.includes('en')) links.push({ lang: 'x-default', href: urlFor('en') });
  return links;
}

export function generateHreflangLinks(path: string): HreflangLink[] {
  return generateHreflangLinksFor((locale) => buildCanonicalUrl(path, locale));
}

export function hreflangTagsFor(urlFor: (locale: Locale) => string): string {
  const links = generateHreflangLinksFor(urlFor);
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

export function hreflangTags(path: string): string {
  return hreflangTagsFor((locale) => buildCanonicalUrl(path, locale));
}
