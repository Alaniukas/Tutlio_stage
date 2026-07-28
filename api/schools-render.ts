import type { VercelRequest, VercelResponse } from './types';
import { isSsrMethod, rejectSsrMethod, sendSsrHtml } from './_lib/ssr-http.js';
import {
  type Locale,
  type DomainKey,
  detectDomain,
  detectLocale,
  buildPath,
  buildPlatformPath,
  buildPlatformCanonicalUrl,
  localizedPagePath,
  renderShell,
  preloadSsrLocales,
  t,
  esc,
  webPageJsonLd,
  faqJsonLd,
  hreflangCode,
} from './_lib/ssr-shell.js';

const SCHOOLS_FAQ_KEYS = ['whatIs', 'whoFor', 'contracts', 'pricing', 'trial'] as const;

type SchoolsPageId = 'landing' | 'pricing';

const PLATFORM_PREFIX = '/schools';

const SUB_PATHS: Record<SchoolsPageId, string> = {
  landing: '/',
  pricing: '/pricing',
};

export const SCHOOLS_FEATURE_KEYS = ['scheduling', 'waitlist', 'payments', 'reminders'];
export const SCHOOLS_HIGHLIGHT_KEYS = [
  'calendar', 'reminders', 'messaging', 'plans', 'autoPayments',
  'invoices', 'parents', 'files', 'stats', 'waitlist', 'whiteLabel', 'whiteboard',
];

function renderSchoolsLanding(locale: Locale, domain: DomainKey): string {
  const contactPath = buildPath(localizedPagePath('contacts', locale), locale, domain);
  const pricingPath = buildPlatformPath(PLATFORM_PREFIX, '/pricing', locale, domain);

  const featuresHtml = SCHOOLS_FEATURE_KEYS
    .map((k) => {
      const bullets = [1, 2, 3]
        .map((n) => `<li>${esc(t(locale, `schoolsLanding.feat.${k}B${n}`))}</li>`)
        .join('\n');
      return `<div class="card">
    <h3>${esc(t(locale, `schoolsLanding.feat.${k}`))}</h3>
    <p>${esc(t(locale, `schoolsLanding.feat.${k}Desc`))}</p>
    <ul style="margin-top:10px;padding-left:18px;color:#555;font-size:.88rem">${bullets}</ul>
  </div>`;
    })
    .join('\n');

  const stepsHtml = [1, 2, 3]
    .map(
      (n) => `<div class="card">
    <h3>${n}. ${esc(t(locale, `schoolsLanding.step${n}Title`))}</h3>
    <p>${esc(t(locale, `schoolsLanding.step${n}Desc`))}</p>
  </div>`,
    )
    .join('\n');

  const highlightsHtml = SCHOOLS_HIGHLIGHT_KEYS
    .map(
      (k) => `<div class="card">
    <h3>${esc(t(locale, `schoolsLanding.hl.${k}`))}</h3>
    <p>${esc(t(locale, `schoolsLanding.hl.${k}Desc`))}</p>
  </div>`,
    )
    .join('\n');

  return `
<div class="hero">
  <h1>${esc(t(locale, 'schoolsLanding.heroTitle'))}${esc(t(locale, 'schoolsLanding.heroTitleHighlight'))}</h1>
  <p>${esc(t(locale, 'schoolsLanding.heroSubtitle'))}</p>
  <a href="${contactPath}" class="btn">${esc(t(locale, 'schoolsLanding.heroCta'))}</a>
</div>
<div class="section">
  <h2>${esc(t(locale, 'schoolsLanding.stepsTitle'))}</h2>
  <p>${esc(t(locale, 'schoolsLanding.stepsDesc'))}</p>
  <div class="grid">${stepsHtml}</div>
</div>
<div class="section">
  <h2>${esc(t(locale, 'schoolsLanding.featuresHeading'))}${esc(t(locale, 'schoolsLanding.featuresHighlight'))}</h2>
  <p>${esc(t(locale, 'schoolsLanding.featuresSubtitle'))}</p>
  <div class="grid">${featuresHtml}</div>
</div>
<div class="section">
  <h2>${esc(t(locale, 'schoolsLanding.highlightsTitle'))}${esc(t(locale, 'schoolsLanding.highlightsHighlight'))}</h2>
  <p>${esc(t(locale, 'schoolsLanding.highlightsSubtitle'))}</p>
  <div class="grid">${highlightsHtml}</div>
</div>
<div class="section" style="text-align:center;padding:60px 24px">
  <h2>${esc(t(locale, 'schoolsLanding.ctaBannerTitle'))}</h2>
  <p>${esc(t(locale, 'schoolsLanding.ctaBannerDesc'))}</p>
  <a href="${contactPath}" class="btn">${esc(t(locale, 'schoolsLanding.ctaBannerBtn'))}</a>
  <p style="margin-top:16px"><a href="${pricingPath}">${esc(t(locale, 'common.prices'))}</a></p>
</div>`;
}

function renderSchoolsPricing(locale: Locale, domain: DomainKey): string {
  const contactPath = buildPath(localizedPagePath('contacts', locale), locale, domain);

  const features = [
    'calendar', 'waitlist', 'payments', 'reminders', 'comments',
    'files', 'finance', 'messaging', 'plans', 'autoPayments', 'invoices', 'parents',
  ];
  const featuresHtml = features
    .map((f) => `<li>${esc(t(locale, `pricing.feature.${f}`))}</li>`)
    .join('\n');

  return `
<div class="hero">
  <h1>${esc(t(locale, 'pricing.title'))}</h1>
  <p>${esc(t(locale, 'schoolsLanding.heroSubtitle'))}</p>
</div>
<div class="section">
  <div class="grid">
    <div class="card">
      <h3>${esc(t(locale, 'schoolsLanding.highlightsBadge'))}</h3>
      <p>${esc(t(locale, 'schoolsLanding.highlightsSubtitle'))}</p>
      <a href="${contactPath}" class="btn" style="margin-top:16px">${esc(t(locale, 'schoolsLanding.integCta'))}</a>
    </div>
  </div>
  <div style="margin-top:40px">
    <h3>${esc(t(locale, 'pricing.allFeatures'))}</h3>
    <ul style="margin-top:12px;padding-left:20px;color:#555">${featuresHtml}</ul>
  </div>
</div>
<div class="section" style="text-align:center;padding:60px 24px">
  <h2>${esc(t(locale, 'schoolsLanding.ctaBannerTitle'))}</h2>
  <p>${esc(t(locale, 'schoolsLanding.ctaBannerDesc'))}</p>
  <a href="${contactPath}" class="btn">${esc(t(locale, 'schoolsLanding.ctaBannerBtn'))}</a>
</div>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isSsrMethod(req.method)) return rejectSsrMethod(res);

  const page = (typeof req.query.page === 'string' ? req.query.page : 'landing') as SchoolsPageId;
  if (!SUB_PATHS[page]) return res.status(404).send('Not found');

  const domain = detectDomain(req);
  const locale = detectLocale(req);
  await preloadSsrLocales(locale, 'en', 'lt');

  const subPath = SUB_PATHS[page];
  // Canonical lives under /schools even when serving the /teachers alias.
  const urlFor = (l: Locale) => buildPlatformCanonicalUrl(PLATFORM_PREFIX, subPath, l);

  const landingTitle = `${t(locale, 'schoolsLanding.heroTitle')}${t(locale, 'schoolsLanding.heroTitleHighlight')}`;
  const title = page === 'landing'
    ? `${landingTitle} | ${t(locale, 'nav.brandSchools')}`
    : `${t(locale, 'pricing.title')} | ${t(locale, 'nav.brandSchools')}`;
  const description = page === 'landing'
    ? t(locale, 'schoolsLanding.heroSubtitle')
    : t(locale, 'schoolsLanding.ctaBannerDesc');

  const canonicalUrl = urlFor(locale);
  const schoolsFaq = page === 'landing'
    ? SCHOOLS_FAQ_KEYS.map((f) => ({
        question: t(locale, `schoolsLanding.faq.${f}Q`),
        answer: t(locale, `schoolsLanding.faq.${f}A`),
      }))
    : [];
  const jsonLd = page === 'landing'
    ? `${webPageJsonLd({ name: title, description, url: canonicalUrl })}</script><script type="application/ld+json">${faqJsonLd(schoolsFaq)}`
    : webPageJsonLd({ name: title, description, url: canonicalUrl });

  const breadcrumbs = page === 'pricing'
    ? [
        { name: landingTitle, url: buildPlatformCanonicalUrl(PLATFORM_PREFIX, '/', locale) },
        { name: t(locale, 'pricing.title'), url: canonicalUrl },
      ]
    : undefined;

  const body = page === 'landing'
    ? renderSchoolsLanding(locale, domain)
    : renderSchoolsPricing(locale, domain);

  const html = renderShell({
    locale,
    domain,
    path: buildPlatformPath(PLATFORM_PREFIX, subPath, locale, domain),
    title,
    description,
    body,
    jsonLd,
    breadcrumbs,
    urlFor,
  });

  sendSsrHtml(req, res, html, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Language': hreflangCode(locale),
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
  });
}
