import type { VercelRequest } from '../types';
import { lt } from '../../src/lib/i18n/lt.js';
import { en } from '../../src/lib/i18n/en.js';
import { pl } from '../../src/lib/i18n/pl.js';
import { lv } from '../../src/lib/i18n/lv.js';
import { ee } from '../../src/lib/i18n/ee.js';
import { fr } from '../../src/lib/i18n/fr.js';
import { es } from '../../src/lib/i18n/es.js';
import { de } from '../../src/lib/i18n/de.js';
import { se } from '../../src/lib/i18n/se.js';
import { dk } from '../../src/lib/i18n/dk.js';
import { fi } from '../../src/lib/i18n/fi.js';
import { no } from '../../src/lib/i18n/no.js';

export type Locale = 'lt' | 'en' | 'pl' | 'lv' | 'ee' | 'fr' | 'es' | 'de' | 'se' | 'dk' | 'fi' | 'no';
export const LOCALES: Locale[] = ['lt', 'en', 'pl', 'lv', 'ee', 'fr', 'es', 'de', 'se', 'dk', 'fi', 'no'];

const DOMAINS = {
  lt: 'https://www.tutlio.lt',
  com: 'https://www.tutlio.com',
} as const;

const translations: Record<Locale, Record<string, string>> = { lt, en, pl, lv, ee, fr, es, de, se, dk, fi, no };

export function t(locale: Locale, key: string, params?: Record<string, string | number>): string {
  let text = translations[locale]?.[key] ?? translations.en[key] ?? translations.lt[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export type DomainKey = 'lt' | 'com';

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
  const domain = detectDomain(req);
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

export function generateHreflangLinks(path: string): HreflangLink[] {
  const links: HreflangLink[] = [];

  for (const locale of LOCALES) {
    links.push({ lang: locale, href: buildFullUrl(path, locale, 'lt') });
    links.push({ lang: locale, href: buildFullUrl(path, locale, 'com') });
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

const OG_LOCALE_MAP: Record<Locale, string> = {
  lt: 'lt_LT',
  en: 'en_US',
  pl: 'pl_PL',
  lv: 'lv_LV',
  ee: 'et_EE',
  fr: 'fr_FR',
  es: 'es_ES',
  de: 'de_DE',
  se: 'sv_SE',
  dk: 'da_DK',
  fi: 'fi_FI',
  no: 'nb_NO',
};

export interface ShellOptions {
  locale: Locale;
  domain: DomainKey;
  path: string;
  title: string;
  description: string;
  ogImage?: string;
  body: string;
  jsonLd?: string;
  extraHead?: string;
  breadcrumbs?: { name: string; url: string }[];
}

export function renderShell(opts: ShellOptions): string {
  const { locale, domain, path, title, description, ogImage, body, jsonLd, extraHead, breadcrumbs } = opts;
  const canonicalUrl = buildFullUrl(path, locale, domain);

  const ogLocaleAlternates = LOCALES
    .filter((l) => l !== locale)
    .map((l) => `<meta property="og:locale:alternate" content="${OG_LOCALE_MAP[l]}" />`)
    .join('\n');

  const breadcrumbLd = breadcrumbs && breadcrumbs.length > 0
    ? `<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumbs.map((b, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: b.name,
          item: b.url,
        })),
      })}</script>`
    : '';

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<link rel="canonical" href="${esc(canonicalUrl)}" />
${hreflangTags(path)}
<meta property="og:type" content="website" />
<meta property="og:locale" content="${OG_LOCALE_MAP[locale]}" />
${ogLocaleAlternates}
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${esc(canonicalUrl)}" />
<meta property="og:site_name" content="Tutlio" />
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}" />` : ''}
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
${ogImage ? `<meta name="twitter:image" content="${esc(ogImage)}" />` : ''}
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
${jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : ''}
${breadcrumbLd}
${extraHead || ''}
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,sans-serif;color:#1a1a1a;line-height:1.7;background:#fff}
a{color:#4f46e5;text-decoration:none}
a:hover{text-decoration:underline}
.nav{display:flex;align-items:center;justify-content:space-between;max-width:1100px;margin:0 auto;padding:16px 24px}
.nav-logo{font-weight:700;font-size:1.3rem;color:#1a1a1a}
.nav-links{display:flex;gap:20px;font-size:.9rem}
.hero{max-width:1100px;margin:0 auto;padding:40px 24px 0}
.hero h1{font-size:2.2rem;font-weight:700;line-height:1.3;margin-bottom:12px}
.hero p{color:#555;font-size:1.1rem;max-width:640px;margin-bottom:24px}
.section{max-width:1100px;margin:0 auto;padding:48px 24px}
.section h2{font-size:1.6rem;font-weight:700;margin-bottom:8px}
.section p{color:#555;font-size:1rem;margin-bottom:16px}
.btn{display:inline-block;background:#4f46e5;color:#fff;padding:12px 28px;border-radius:8px;font-weight:600;font-size:.95rem;text-decoration:none;transition:background .2s}
.btn:hover{background:#4338ca;text-decoration:none}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:24px;margin-top:24px}
.card{border:1px solid #e5e7eb;border-radius:12px;padding:24px;transition:box-shadow .2s}
.card:hover{box-shadow:0 4px 16px rgba(0,0,0,.06)}
.card h3{font-size:1.1rem;font-weight:600;margin-bottom:6px}
.card p{color:#666;font-size:.9rem;line-height:1.5}
.faq{max-width:760px;margin:0 auto;padding:0 24px 60px}
.faq details{border-bottom:1px solid #e5e7eb;padding:16px 0}
.faq summary{font-weight:600;cursor:pointer;font-size:1rem}
.faq p{margin-top:8px;color:#555;font-size:.95rem}
.footer{border-top:1px solid #e5e7eb;text-align:center;padding:24px;color:#888;font-size:.85rem;margin-top:auto}
</style>
</head>
<body>
<nav class="nav">
  <a href="${buildPath('/', locale, domain)}" class="nav-logo">Tutlio</a>
  <div class="nav-links">
    <a href="${buildPath('/pricing', locale, domain)}">${t(locale, 'common.prices')}</a>
    <a href="${buildPath('/apie-mus', locale, domain)}">${t(locale, 'nav.aboutUs')}</a>
    <a href="${buildPath('/blog', locale, domain)}">${({ lt: 'Tinklaraštis', en: 'Blog', pl: 'Blog', lv: 'Emuārs', ee: 'Blogi', fr: 'Blog', es: 'Blog', de: 'Blog', se: 'Blogg', dk: 'Blog', fi: 'Blogi', no: 'Blogg' })[locale]}</a>
  </div>
</nav>
${body}
<footer class="footer">${t(locale, 'common.allRightsReserved', { year: new Date().getFullYear() })}</footer>
</body>
</html>`;
}

export function organizationJsonLd(): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Tutlio',
    url: 'https://www.tutlio.com',
    logo: 'https://www.tutlio.com/pwa-512x512.png',
    sameAs: ['https://www.tutlio.lt'],
  });
}

export function webPageJsonLd(opts: { name: string; description: string; url: string }): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: opts.name,
    description: opts.description,
    url: opts.url,
    publisher: { '@type': 'Organization', name: 'Tutlio', url: 'https://www.tutlio.com' },
  });
}

export function faqJsonLd(items: { question: string; answer: string }[]): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({
      '@type': 'Question',
      name: i.question,
      acceptedAnswer: { '@type': 'Answer', text: i.answer },
    })),
  });
}

export function softwareAppJsonLd(locale: Locale): string {
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Tutlio',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: t(locale, 'landing.heroBadge'),
    offers: {
      '@type': 'Offer',
      price: '19.99',
      priceCurrency: 'EUR',
    },
    publisher: { '@type': 'Organization', name: 'Tutlio' },
  });
}
