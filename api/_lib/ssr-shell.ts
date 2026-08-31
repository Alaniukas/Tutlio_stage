import { LOCALE_FORMAT_TAGS, LOCALE_NAMES, localeDirection, withEnglishLocaleFallback } from '../../src/lib/i18n/locales.js';
import { isSeoPublished, seoLocalesForPath } from '../../src/lib/i18n/localeRelease.js';
export {
  type Locale,
  LOCALES,
  type DomainKey,
  type HreflangLink,
  type LocalizedPageId,
  esc,
  detectDomain,
  getDefaultLocale,
  detectLocale,
  buildPath,
  buildFullUrl,
  canonicalDomain,
  buildCanonicalUrl,
  buildPlatformPath,
  buildPlatformCanonicalUrl,
  publicPagePath,
  buildPublicPageCanonicalUrl,
  localizedPagePath,
  generateHreflangLinks,
  generateHreflangLinksFor,
  hreflangTags,
  hreflangTagsFor,
  hreflangCode,
} from './seo-routing.js';

export { preloadSsrLocales, t } from './ssr-i18n.js';

import {
  type Locale,
  type DomainKey,
  esc,
  buildPath,
  buildPlatformPath,
  buildFullUrl,
  buildCanonicalUrl,
  localizedPagePath,
  hreflangTagsFor,
  hreflangCode,
} from './seo-routing.js';
import { t } from './ssr-i18n.js';
import { TUTOR_PLANS } from '../../src/lib/pricing.js';
import { SUBSCRIPTION_PLN } from '../../src/lib/subscriptionPricing.js';

const OG_LOCALE_MAP = Object.fromEntries(Object.entries(LOCALE_FORMAT_TAGS).map(([locale, tag]) => [locale, tag.split('-u-')[0].replace('-', '_')]));
const LOCALE_NATIVE_NAMES = LOCALE_NAMES;

function jsonLdStringify(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

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
  /**
   * Per-locale canonical URL builder. Override for pages whose locale variant
   * is not a simple `/{locale}{path}` prefix (e.g. /schools/:locale, /about
   * vs /apie-mus). Drives canonical, hreflang, and the locale-links footer.
   */
  urlFor?: (locale: Locale) => string;
  /** Override the normal all-locale cluster. An empty string deliberately
   * suppresses hreflang for single-locale user-authored pages. */
  hreflangHtml?: string;
  /** Public user-authored pages are not translated variants, so they must not
   * expose links that imply 13 equivalent language versions. */
  showLocaleLinks?: boolean;
  /** Defaults to every supported locale for regular translated pages. */
  ogAlternateLocales?: Locale[];
  /** Defaults to the indexable marketing-page directive. */
  robots?: string;
  /** Defaults to website; public person profiles use the Open Graph profile type. */
  ogType?: 'website' | 'profile';
}

function localeLinksHtml(urlFor: (locale: Locale) => string, current: Locale, domain: DomainKey): string {
  if (domain === 'pl') return '';
  const links = seoLocalesForPath(new URL(urlFor('en')).pathname).map((l) =>
    l === current
      ? `<span lang="${hreflangCode(l)}">${LOCALE_NATIVE_NAMES[l]}</span>`
      : `<a href="${esc(urlFor(l))}" hreflang="${hreflangCode(l)}" lang="${hreflangCode(l)}">${LOCALE_NATIVE_NAMES[l]}</a>`,
  );
  return `<nav class="footer-langs" aria-label="Languages">${links.join('\n    ')}</nav>`;
}

export function renderShell(opts: ShellOptions): string {
  const { locale, domain, path, title, description, body, jsonLd, extraHead, breadcrumbs } = opts;
  const ogImage = opts.ogImage || DEFAULT_OG_IMAGE;
  const ogImageDimensions = opts.ogImage
    ? ''
    : '<meta property="og:image:width" content="1200" />\n<meta property="og:image:height" content="800" />';
  const urlFor = opts.urlFor || ((l: Locale) => buildCanonicalUrl(path, l));
  const canonicalUrl = urlFor(locale);
  const seoPath = new URL(canonicalUrl).pathname;

  const ogLocaleAlternates = (opts.ogAlternateLocales ?? seoLocalesForPath(seoPath))
    .filter((l) => l !== locale)
    .map((l) => `<meta property="og:locale:alternate" content="${OG_LOCALE_MAP[l]}" />`)
    .join('\n');

  const breadcrumbLd = breadcrumbs && breadcrumbs.length > 0
    ? `<script type="application/ld+json">${jsonLdStringify({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        '@id': `${canonicalUrl}#breadcrumb`,
        itemListElement: breadcrumbs.map((b, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: b.name,
          item: b.url,
        })),
      })}</script>`
    : '';
  const breadcrumbHtml = breadcrumbs && breadcrumbs.length > 1
    ? `<nav class="breadcrumbs" aria-label="Breadcrumb"><ol>${breadcrumbs.map((b, i) => {
        const isCurrent = i === breadcrumbs.length - 1;
        return `<li>${isCurrent
          ? `<span aria-current="page">${esc(b.name)}</span>`
          : `<a href="${esc(b.url)}">${esc(b.name)}</a>`}</li>`;
      }).join('')}</ol></nav>`
    : '';

  return `<!DOCTYPE html>
<html lang="${hreflangCode(locale)}" dir="${localeDirection(locale)}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<meta name="robots" content="${esc(!isSeoPublished(locale, seoPath) ? 'noindex, follow' : opts.robots || 'index, follow, max-image-preview:large')}" />
<link rel="canonical" href="${esc(canonicalUrl)}" />
<link rel="alternate" type="application/rss+xml" title="Tutlio Blog" href="${esc(buildCanonicalUrl('/blog/rss.xml', locale))}" />
${opts.hreflangHtml ?? hreflangTagsFor(urlFor)}
<meta property="og:type" content="${opts.ogType || 'website'}" />
<meta property="og:locale" content="${OG_LOCALE_MAP[locale]}" />
${ogLocaleAlternates}
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${esc(canonicalUrl)}" />
<meta property="og:site_name" content="Tutlio" />
<meta property="og:image" content="${esc(ogImage)}" />
${ogImageDimensions}
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${esc(ogImage)}" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png" />
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#4f46e5" />
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
.breadcrumbs{max-width:1100px;margin:0 auto;padding:14px 24px 0;font-size:.82rem;color:#6b7280}
.breadcrumbs ol{display:flex;flex-wrap:wrap;gap:8px;list-style:none}
.breadcrumbs li:not(:last-child)::after{content:'›';margin-left:8px;color:#9ca3af}
.breadcrumbs a{color:#4f46e5}
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
.footer-links{display:flex;flex-wrap:wrap;justify-content:center;gap:16px;margin-bottom:12px}
.footer-links a{color:#4f46e5}
.footer-langs{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;margin-bottom:12px;font-size:.8rem}
.footer-langs a{color:#666}
.footer-langs span{color:#1a1a1a;font-weight:600}
.legal-sub{color:#555;margin-bottom:24px}
.legal h2{font-size:1.25rem;font-weight:600;margin:28px 0 10px}
.legal h3{font-size:1.05rem;font-weight:600;margin:20px 0 8px}
.legal p,.legal li{color:#555;font-size:.92rem;margin-bottom:10px}
.legal ul{margin:8px 0 16px;padding-left:22px}
</style>
</head>
<body>
<nav class="nav">
  <a href="${buildPath('/', locale, domain)}" class="nav-logo">Tutlio</a>
  <div class="nav-links">
    <a href="${buildPath('/features', locale, domain)}">${t(locale, 'nav.features')}</a>
    <a href="${buildPath('/pricing', locale, domain)}">${t(locale, 'common.prices')}</a>
    <a href="${buildPath(localizedPagePath('about', locale), locale, domain)}">${t(locale, 'nav.aboutUs')}</a>
    <a href="${buildPath('/blog', locale, domain)}">${withEnglishLocaleFallback({el: 'Ιστολόγιο', uk: 'Блог', bg: 'Блог', th: 'บล็อก', he: 'בלוג', 'zh-hk': '網誌', ja: 'ブログ', ko: '블로그', ar: 'المدونة', lt: 'Tinklaraštis', en: 'Blog', pl: 'Blog', lv: 'Emuārs', ee: 'Blogi', fr: 'Blog', es: 'Blog', de: 'Blog', se: 'Blogg', dk: 'Blog', fi: 'Blogi', no: 'Blogg', nl: 'Blog' })[locale]}</a>
  </div>
</nav>
${breadcrumbHtml}
${body}
<footer class="footer">
  <div class="footer-links">
    <a href="${buildPath('/features', locale, domain)}">${t(locale, 'nav.features')}</a>
    <a href="${buildPath('/privacy-policy', locale, domain)}">${t(locale, 'footer.privacyPolicy')}</a>
    <a href="${buildPath('/terms', locale, domain)}">${t(locale, 'footer.terms')}</a>
    <a href="${buildPath('/dpa', locale, domain)}">${t(locale, 'footer.dpa')}</a>
    <a href="${buildPath(localizedPagePath('contacts', locale), locale, domain)}">${t(locale, 'contact.title')}</a>
    <a href="${buildPlatformPath('/schools', '/', locale, domain)}">${withEnglishLocaleFallback({cs: 'Pro školy', sl: 'Za šole', el: 'Για σχολές', uk: 'Для шкіл', sk: 'Pre školy', bg: 'За училища', th: 'สำหรับโรงเรียน', he: 'לבתי ספר', 'zh-hk': '學校專用', ja: '学校向け', hi: 'स्कूलों के लिए', ko: '학교용', id: 'Untuk sekolah', ar: 'للمدارس', lt: 'Mokykloms', hr: 'Za škole', hu: 'Iskoláknak', en: 'For Schools', tr: 'Okullar için', fil: 'Para sa mga paaralan', pt: 'Para escolas', 'pt-br': 'Para escolas', ro: 'Pentru școli', it: 'Per le scuole', 'es-mx': 'Para escuelas', pl: 'Dla szkół', lv: 'Skolām', ee: 'Koolidele', fr: 'Pour les écoles', es: 'Para escuelas', de: 'Für Schulen', se: 'För skolor', dk: 'Til skoler', fi: 'Kouluille', no: 'For skoler', nl: 'Voor scholen' })[locale]}</a>
  </div>
  ${opts.showLocaleLinks === false ? '' : localeLinksHtml(urlFor, locale, domain)}
  ${t(locale, 'common.allRightsReserved', { year: new Date().getFullYear() })}
</footer>
</body>
</html>`;
}

export const DEFAULT_OG_IMAGE = 'https://www.tutlio.com/og-image.jpg';

export function organizationJsonLd(locale: Locale = 'en'): string {
  const url = buildCanonicalUrl('/', locale);
  const description = t(locale, 'landing.heroDesc').replace(/<[^>]+>/g, '');
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': 'https://www.tutlio.com/#organization',
    name: 'Tutlio',
    legalName: 'MB Tutlio',
    url,
    logo: {
      '@type': 'ImageObject',
      '@id': 'https://www.tutlio.com/#logo',
      url: 'https://www.tutlio.com/pwa-512x512.png',
      width: 512,
      height: 512,
    },
    description,
    email: 'info@tutlio.lt',
    telephone: '+37062394956',
    taxID: '307617263',
    foundingDate: '2024',
    areaServed: 'Worldwide',
    address: {
      '@type': 'PostalAddress',
      addressCountry: 'LT',
    },
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'info@tutlio.lt',
      telephone: '+37062394956',
      contactType: 'customer support',
      availableLanguage: ['English', 'Lithuanian', 'Polish'],
    },
  });
}

export function websiteJsonLd(locale: Locale = 'en'): string {
  const url = buildCanonicalUrl('/', locale);
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${url}#website`,
    name: 'Tutlio',
    url,
    description: t(locale, 'landing.heroDesc').replace(/<[^>]+>/g, ''),
    publisher: { '@id': 'https://www.tutlio.com/#organization' },
  });
}

export function webPageJsonLd(opts: { locale: Locale; name: string; description: string; url: string }): string {
  let publisherUrl = 'https://www.tutlio.com';
  try {
    publisherUrl = new URL(opts.url).origin;
  } catch {
    // Keep the stable global fallback if a caller ever passes a relative URL.
  }
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${opts.url}#webpage`,
    name: opts.name,
    description: opts.description,
    url: opts.url,
    inLanguage: hreflangCode(opts.locale),
    isPartOf: { '@id': `${buildCanonicalUrl('/', opts.locale)}#website` },
    publisher: { '@type': 'Organization', '@id': 'https://www.tutlio.com/#organization', name: 'Tutlio', url: publisherUrl },
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
  const isPl = locale === 'pl';
  const canonicalHome = buildCanonicalUrl('/', locale);
  const parsedHome = new URL(canonicalHome);
  const site = parsedHome.pathname === '/' ? parsedHome.origin : canonicalHome;
  const pricingUrl = buildCanonicalUrl('/pricing', locale);
  const offers = isPl
    ? [
        { '@type': 'Offer', name: t(locale, 'pricing.monthly'), price: SUBSCRIPTION_PLN.monthly.toFixed(2), priceCurrency: 'PLN', url: pricingUrl },
        { '@type': 'Offer', name: t(locale, 'pricing.yearly'), price: SUBSCRIPTION_PLN.yearlyPerMonth.toFixed(2), priceCurrency: 'PLN', url: pricingUrl },
        { '@type': 'Offer', name: t(locale, 'pricing.subscriptionOnly'), price: SUBSCRIPTION_PLN.subscriptionOnly.toFixed(2), priceCurrency: 'PLN', url: pricingUrl },
      ]
    : [
        { '@type': 'Offer', name: t(locale, 'pricing.monthly'), price: TUTOR_PLANS.monthly.pricePerMonthEur.toFixed(2), priceCurrency: 'EUR', url: pricingUrl },
        { '@type': 'Offer', name: t(locale, 'pricing.yearly'), price: TUTOR_PLANS.yearly.pricePerMonthEur.toFixed(2), priceCurrency: 'EUR', url: pricingUrl },
        { '@type': 'Offer', name: t(locale, 'pricing.subscriptionOnly'), price: TUTOR_PLANS.subscriptionOnly.pricePerMonthEur.toFixed(2), priceCurrency: 'EUR', url: pricingUrl },
      ];
  const description = t(locale, 'landing.heroDesc').replace(/<[^>]+>/g, '');
  return JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Tutlio',
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'EducationApplication',
    operatingSystem: 'Web',
    inLanguage: hreflangCode(locale),
    description,
    url: site,
    image: DEFAULT_OG_IMAGE,
    featureList: [
      t(locale, 'landing.feature.calendar'),
      t(locale, 'landing.feature.payments'),
      t(locale, 'pricing.feature.invoices'),
      t(locale, 'landing.feature.reminders'),
      t(locale, 'landing.feature.waitlist'),
      t(locale, 'landing.feature.cancellation'),
      t(locale, 'landing.feature.comments'),
      t(locale, 'pricing.feature.parents'),
      t(locale, 'pricing.feature.messaging'),
      t(locale, 'landing.v2.bento4Title'),
      t(locale, 'landing.v2.bento1Title'),
      t(locale, 'landing.v2.bento5Title'),
    ].join(', '),
    offers,
    publisher: {
      '@type': 'Organization',
      '@id': 'https://www.tutlio.com/#organization',
      name: 'Tutlio',
      url: site,
    },
  });
}
