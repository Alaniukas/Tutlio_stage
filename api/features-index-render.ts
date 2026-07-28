import type { VercelRequest, VercelResponse } from './types';
import { isSsrMethod, rejectSsrMethod, sendSsrHtml } from './_lib/ssr-http.js';
import {
  type Locale,
  type DomainKey,
  detectDomain,
  detectLocale,
  buildPath,
  buildCanonicalUrl,
  renderShell,
  preloadSsrLocales,
  t,
  esc,
  webPageJsonLd,
  faqJsonLd,
  hreflangCode,
} from './_lib/ssr-shell.js';
import {
  FEATURE_PAGE_IDS,
  FEATURE_PAGES,
  FEATURE_HUB_HIGHLIGHT_KEYS,
  featureHubHighlightPath,
} from '../src/lib/featurePages.js';

const LANDING_FAQ_KEYS = ['whatIs', 'whoFor', 'waitlist', 'freeTrial'] as const;

function renderFeaturesIndex(locale: Locale, domain: DomainKey): string {
  const registerPath = buildPath('/register', locale, domain);
  const pricingPath = buildPath('/pricing', locale, domain);

  const deepCards = FEATURE_PAGE_IDS.map((id) => {
    const cfg = FEATURE_PAGES[id];
    const href = buildPath(cfg.path, locale, domain);
    return `<a href="${href}" class="card" style="text-decoration:none;color:inherit;display:block">
    <h3>${esc(t(locale, cfg.titleKey))}</h3>
    <p>${esc(t(locale, cfg.descKey))}</p>
    <p style="margin-top:12px;color:#4f46e5;font-weight:600;font-size:.9rem">${esc(t(locale, 'featuresIndex.readMore'))} →</p>
  </a>`;
  }).join('\n');

  const highlightCards = FEATURE_HUB_HIGHLIGHT_KEYS.map((key) => {
    const title = esc(t(locale, `landing.hl.${key}`));
    const desc = esc(t(locale, `landing.hl.${key}Desc`));
    const deepPath = featureHubHighlightPath(key);
    if (deepPath) {
      const href = buildPath(deepPath, locale, domain);
      return `<a href="${href}" class="card" style="text-decoration:none;color:inherit;display:block">
    <h3>${title}</h3>
    <p>${desc}</p>
  </a>`;
    }
    return `<div class="card"><h3>${title}</h3><p>${desc}</p></div>`;
  }).join('\n');

  const faqHtml = LANDING_FAQ_KEYS.map(
    (f) => `<details>
    <summary>${esc(t(locale, `landing.faq.${f}Q`))}</summary>
    <p>${esc(t(locale, `landing.faq.${f}A`))}</p>
  </details>`,
  ).join('\n');

  return `
<div class="hero">
  <p style="font-size:.8rem;font-weight:600;color:#666;text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px">${esc(t(locale, 'featuresIndex.badge'))}</p>
  <h1>${esc(t(locale, 'featuresIndex.title'))}</h1>
  <p>${esc(t(locale, 'featuresIndex.subtitle'))}</p>
</div>
<div class="section">
  <h2>${esc(t(locale, 'featuresIndex.deepTitle'))}</h2>
  <p>${esc(t(locale, 'featuresIndex.deepSubtitle'))}</p>
  <div class="grid">${deepCards}</div>
</div>
<div class="section">
  <h2>${esc(t(locale, 'featuresIndex.allTitle'))}</h2>
  <p>${esc(t(locale, 'featuresIndex.allSubtitle'))}</p>
  <div class="grid">${highlightCards}</div>
</div>
<div class="section">
  <h2>${esc(t(locale, 'landing.faqTitle'))}</h2>
</div>
<div class="faq">${faqHtml}</div>
<div class="section" style="text-align:center;padding:60px 24px">
  <h2>${esc(t(locale, 'landing.ctaTitle'))}</h2>
  <p>${esc(t(locale, 'landing.ctaDesc'))}</p>
  <a href="${registerPath}" class="btn">${esc(t(locale, 'landing.startFree'))}</a>
  <p style="margin-top:16px"><a href="${pricingPath}">${esc(t(locale, 'common.prices'))}</a></p>
</div>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isSsrMethod(req.method)) return rejectSsrMethod(res);

  const domain = detectDomain(req);
  const locale = detectLocale(req);
  await preloadSsrLocales(locale, 'en', 'lt');

  const path = '/features';
  const title = `${t(locale, 'featuresIndex.title')} | Tutlio`;
  const description = t(locale, 'featuresIndex.metaDesc');
  const canonicalUrl = buildCanonicalUrl(path, locale);

  const faqItems = LANDING_FAQ_KEYS.map((f) => ({
    question: t(locale, `landing.faq.${f}Q`),
    answer: t(locale, `landing.faq.${f}A`),
  }));

  const jsonLd = `${webPageJsonLd({ name: title, description, url: canonicalUrl })}</script><script type="application/ld+json">${faqJsonLd(faqItems)}`;

  const homeUrl = buildCanonicalUrl('/', locale);
  const breadcrumbs = [
    { name: 'Tutlio', url: homeUrl },
    { name: t(locale, 'featuresIndex.title'), url: canonicalUrl },
  ];

  const body = renderFeaturesIndex(locale, domain);
  const html = renderShell({ locale, domain, path, title, description, body, jsonLd, breadcrumbs });

  sendSsrHtml(req, res, html, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Language': hreflangCode(locale),
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
  });
}
