import type { VercelRequest, VercelResponse } from './types';
import { isSsrMethod, rejectSsrMethod, sendSsrHtml } from './_lib/ssr-http.js';
import { createClient } from '@supabase/supabase-js';
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
  type FeaturePageId as FeatureId,
  FEATURE_PAGES as FEATURES,
} from '../src/lib/featurePages.js';
import { fetchRelatedBlogPosts, relatedPostsForLocale, renderRelatedPostsHtml } from './_lib/blogRelatedLinks.js';

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function renderFeature(featureId: FeatureId, locale: Locale, domain: DomainKey, relatedHtml = ''): string {
  const cfg = FEATURES[featureId];
  const registerPath = buildPath('/register', locale, domain);

  const detailsHtml = cfg.detailKeys
    .map(
      (k) => `<div class="card">
    <h3>${esc(t(locale, `feature.${featureId}.${k}`))}</h3>
    <p>${esc(t(locale, `feature.${featureId}.${k}Desc`))}</p>
  </div>`,
    )
    .join('\n');

  const faqHtml = cfg.faqKeys
    .map(
      (k) => `<details>
    <summary>${esc(t(locale, `feature.${featureId}.faq.${k}Q`))}</summary>
    <p>${esc(t(locale, `feature.${featureId}.faq.${k}A`))}</p>
  </details>`,
    )
    .join('\n');

  return `
<div class="hero">
  <h1>${esc(t(locale, cfg.titleKey))}</h1>
  <p>${esc(t(locale, cfg.descKey))}</p>
  <a href="${registerPath}" class="btn">${esc(t(locale, 'landing.startFree'))}</a>
</div>
<div class="section">
  <h2>${esc(t(locale, `feature.${featureId}.detailsTitle`))}</h2>
  <div class="grid">${detailsHtml}</div>
</div>
<div class="section">
  <h2>${esc(t(locale, 'landing.faqTitle'))}</h2>
</div>
<div class="faq">${faqHtml}</div>
${relatedHtml}
<div class="section" style="text-align:center;padding:60px 24px">
  <h2>${esc(t(locale, 'landing.ctaTitle'))}</h2>
  <p>${esc(t(locale, 'landing.ctaDesc'))}</p>
  <a href="${registerPath}" class="btn">${esc(t(locale, 'landing.startFree'))}</a>
</div>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isSsrMethod(req.method)) return rejectSsrMethod(res);

  const featureId = (typeof req.query.feature === 'string' ? req.query.feature : '') as FeatureId;
  const cfg = FEATURES[featureId];
  if (!cfg) return res.status(404).send('Not found');

  const domain = detectDomain(req);
  const locale = detectLocale(req);
  await preloadSsrLocales(locale, 'en', 'lt');
  const path = cfg.path;

  const title = `${t(locale, cfg.titleKey)} | Tutlio`;
  const description = t(locale, cfg.descKey);

  const faqItems = cfg.faqKeys.map((k) => ({
    question: t(locale, `feature.${featureId}.faq.${k}Q`),
    answer: t(locale, `feature.${featureId}.faq.${k}A`),
  }));

  const jsonLd = `${webPageJsonLd({ name: title, description, url: buildCanonicalUrl(path, locale) })}</script><script type="application/ld+json">${faqJsonLd(faqItems)}`;

  const homeUrl = buildCanonicalUrl('/', locale);
  const breadcrumbs = [
    { name: 'Tutlio', url: homeUrl },
    { name: t(locale, cfg.titleKey), url: buildCanonicalUrl(path, locale) },
  ];

  let relatedHtml = '';
  const supabase = getSupabase();
  if (supabase) {
    const relatedRows = await fetchRelatedBlogPosts(supabase as any, { limit: 3 });
    const related = relatedPostsForLocale(relatedRows, locale);
    if (related.length) {
      const heading = locale === 'lt' ? 'Straipsniai iš tinklaraščio' : 'From the blog';
      relatedHtml = `<div class="section"><h2>${esc(heading)}</h2>${renderRelatedPostsHtml(related, locale)}</div>`;
    }
  }

  const body = renderFeature(featureId, locale, domain, relatedHtml);
  const html = renderShell({ locale, domain, path, title, description, body, jsonLd, breadcrumbs });

  sendSsrHtml(req, res, html, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Language': hreflangCode(locale),
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
  });
}
