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
} from './_lib/ssr-shell.js';

type FeatureId = 'calendar' | 'waitlist' | 'payments' | 'reminders';

interface FeatureConfig {
  path: string;
  titleKey: string;
  descKey: string;
  detailKeys: string[];
  faqKeys: string[];
}

const FEATURES: Record<FeatureId, FeatureConfig> = {
  calendar: {
    path: '/features/calendar',
    titleKey: 'feature.calendar.pageTitle',
    descKey: 'feature.calendar.pageDesc',
    detailKeys: ['selfBooking', 'recurring', 'breaks', 'deadlines'],
    faqKeys: ['howBook', 'groupLessons', 'mobileCalendar'],
  },
  waitlist: {
    path: '/features/waitlist',
    titleKey: 'feature.waitlist.pageTitle',
    descKey: 'feature.waitlist.pageDesc',
    detailKeys: ['autoFill', 'notifications', 'priority', 'revenue'],
    faqKeys: ['howWorks', 'studentLimit', 'automatic'],
  },
  payments: {
    path: '/features/payments',
    titleKey: 'feature.payments.pageTitle',
    descKey: 'feature.payments.pageDesc',
    detailKeys: ['stripe', 'tracking', 'invoices', 'packages'],
    faqKeys: ['methods', 'fees', 'invoiceAuto'],
  },
  reminders: {
    path: '/features/reminders',
    titleKey: 'feature.reminders.pageTitle',
    descKey: 'feature.reminders.pageDesc',
    detailKeys: ['beforeLesson', 'afterLesson', 'paymentDue', 'customTiming'],
    faqKeys: ['channels', 'customize', 'disable'],
  },
};

function renderFeature(featureId: FeatureId, locale: Locale, domain: DomainKey): string {
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

  const body = renderFeature(featureId, locale, domain);
  const html = renderShell({ locale, domain, path, title, description, body, jsonLd, breadcrumbs });

  sendSsrHtml(req, res, html, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Language': locale,
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
  });
}
