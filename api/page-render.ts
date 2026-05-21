import type { VercelRequest, VercelResponse } from './types';
import { isSsrMethod, rejectSsrMethod, sendSsrHtml } from './_lib/ssr-http.js';
import {
  type Locale,
  type DomainKey,
  detectDomain,
  detectLocale,
  buildPath,
  buildFullUrl,
  buildCanonicalUrl,
  renderShell,
  preloadSsrLocales,
  t,
  esc,
  organizationJsonLd,
  webPageJsonLd,
  faqJsonLd,
  softwareAppJsonLd,
} from './_lib/ssr-shell.js';

type PageId = 'landing' | 'pricing' | 'about' | 'contacts';

function renderLanding(locale: Locale, domain: DomainKey): string {
  const features = [
    { key: 'calendar' },
    { key: 'waitlist' },
    { key: 'payments' },
    { key: 'reminders' },
    { key: 'cancellation' },
    { key: 'comments' },
  ];

  const featuresHtml = features
    .map(
      (f) => {
        const featurePath = buildPath(`/features/${f.key}`, locale, domain);
        return `<a href="${featurePath}" class="card" style="text-decoration:none;color:inherit">
    <h3>${esc(t(locale, `landing.feature.${f.key}`))}</h3>
    <p>${esc(t(locale, `landing.feature.${f.key}Desc`))}</p>
  </a>`;
      },
    )
    .join('\n');

  const stepsHtml = [1, 2, 3]
    .map(
      (n) => `<div class="card">
    <h3>${n}. ${esc(t(locale, `landing.step${n}Title`))}</h3>
    <p>${esc(t(locale, `landing.step${n}Desc`))}</p>
  </div>`,
    )
    .join('\n');

  const faqItems = ['whatIs', 'whoFor', 'waitlist', 'freeTrial', 'languages'];
  const faqHtml = faqItems
    .map(
      (f) => `<details>
    <summary>${esc(t(locale, `landing.faq.${f}Q`))}</summary>
    <p>${esc(t(locale, `landing.faq.${f}A`))}</p>
  </details>`,
    )
    .join('\n');

  const pricingPath = buildPath('/pricing', locale, domain);

  return `
<div class="hero">
  <h1>${esc(t(locale, 'landing.heroTitle'))}${esc(t(locale, 'landing.heroTitleHighlight'))}</h1>
  <p>${t(locale, 'landing.heroDesc')}</p>
  <a href="${pricingPath}" class="btn">${esc(t(locale, 'landing.ctaButton'))}</a>
</div>
<div class="section">
  <h2>${esc(t(locale, 'landing.featuresTitle'))}</h2>
  <p>${esc(t(locale, 'landing.featuresDesc'))}</p>
  <div class="grid">${featuresHtml}</div>
</div>
<div class="section">
  <h2>${esc(t(locale, 'landing.stepsTitle'))}</h2>
  <p>${esc(t(locale, 'landing.stepsDesc'))}</p>
  <div class="grid">${stepsHtml}</div>
</div>
<div class="section">
  <h2>${esc(t(locale, 'landing.faqTitle'))}</h2>
</div>
<div class="faq">${faqHtml}</div>
<div class="section" style="text-align:center;padding:60px 24px">
  <h2>${esc(t(locale, 'landing.ctaTitle'))}</h2>
  <p>${esc(t(locale, 'landing.ctaDesc'))}</p>
  <a href="${pricingPath}" class="btn">${esc(t(locale, 'landing.startFree'))}</a>
</div>`;
}

const LANDING_FAQ_KEYS = ['whatIs', 'whoFor', 'waitlist', 'freeTrial', 'languages'];

function renderPricing(locale: Locale, domain: DomainKey): string {
  const features = [
    'calendar', 'waitlist', 'payments', 'reminders', 'comments',
    'files', 'finance', 'messaging', 'plans', 'autoPayments', 'invoices', 'parents',
  ];

  const featuresHtml = features
    .map((f) => `<li>${esc(t(locale, `pricing.feature.${f}`))}</li>`)
    .join('\n');

  const faqItems = ['trial', 'cancel', 'limit', 'payment', 'switch'];
  const faqHtml = faqItems
    .map(
      (f) => `<details>
    <summary>${esc(t(locale, `pricing.faq.${f}Q`))}</summary>
    <p>${esc(t(locale, `pricing.faq.${f}A`))}</p>
  </details>`,
    )
    .join('\n');

  const registerPath = buildPath('/register', locale, domain);

  return `
<div class="hero">
  <h1>${esc(t(locale, 'pricing.title'))}</h1>
  <p>${esc(t(locale, 'pricing.subtitle'))}</p>
</div>
<div class="section">
  <div class="grid">
    <div class="card">
      <h3>${esc(t(locale, 'pricing.monthly'))}</h3>
      <p style="font-size:2rem;font-weight:700;margin:12px 0">€19.99<span style="font-size:.9rem;font-weight:400;color:#666">/mo</span></p>
      <p>${esc(t(locale, 'pricing.monthlyDesc'))}</p>
      <a href="${registerPath}" class="btn" style="margin-top:16px">${esc(t(locale, 'pricing.start7DayTrial'))}</a>
    </div>
    <div class="card">
      <h3>${esc(t(locale, 'pricing.yearly'))}</h3>
      <p style="font-size:2rem;font-weight:700;margin:12px 0">€14.99<span style="font-size:.9rem;font-weight:400;color:#666">/mo</span></p>
      <p>${esc(t(locale, 'pricing.yearlyDesc'))}</p>
      <a href="${registerPath}" class="btn" style="margin-top:16px">${esc(t(locale, 'pricing.start7DayTrial'))}</a>
    </div>
    <div class="card">
      <h3>${esc(t(locale, 'pricing.subscriptionOnly'))}</h3>
      <p style="font-size:2rem;font-weight:700;margin:12px 0">€9.99<span style="font-size:.9rem;font-weight:400;color:#666">/mo</span></p>
      <p>${esc(t(locale, 'pricing.subscriptionOnlyDesc'))}</p>
      <a href="${registerPath}" class="btn" style="margin-top:16px">${esc(t(locale, 'pricing.start7DayTrial'))}</a>
    </div>
  </div>
  <div style="margin-top:40px">
    <h3>${esc(t(locale, 'pricing.allFeatures'))}</h3>
    <ul style="margin-top:12px;padding-left:20px;color:#555">${featuresHtml}</ul>
  </div>
</div>
<div class="section">
  <h2>${esc(t(locale, 'pricing.faqTitle'))}</h2>
</div>
<div class="faq">${faqHtml}</div>
<div class="section" style="text-align:center;padding:60px 24px">
  <h2>${esc(t(locale, 'pricing.readyToStart'))}</h2>
  <p>${esc(t(locale, 'pricing.readyToStartDesc'))}</p>
  <a href="${registerPath}" class="btn">${esc(t(locale, 'pricing.startNow'))}</a>
</div>`;
}

function renderAbout(locale: Locale, _domain: DomainKey): string {
  const values = [
    { key: 'Focus' },
    { key: 'Innovation' },
    { key: 'Security' },
    { key: 'Community' },
  ];

  const valuesHtml = values
    .map(
      (v) => `<div class="card">
    <h3>${esc(t(locale, `about.value${v.key}`))}</h3>
    <p>${esc(t(locale, `about.value${v.key}Desc`))}</p>
  </div>`,
    )
    .join('\n');

  return `
<div class="hero">
  <h1>${esc(t(locale, 'about.title'))}</h1>
  <p>${esc(t(locale, 'about.subtitle'))}</p>
</div>
<div class="section">
  <span style="display:inline-block;background:#eef2ff;color:#4f46e5;padding:4px 12px;border-radius:999px;font-size:.85rem;font-weight:500;margin-bottom:12px">${esc(t(locale, 'about.missionBadge'))}</span>
  <h2>${esc(t(locale, 'about.missionTitle'))}</h2>
  <p>${esc(t(locale, 'about.missionDesc1'))}</p>
  <p>${esc(t(locale, 'about.missionDesc2'))}</p>
</div>
<div class="section">
  <h2>${esc(t(locale, 'about.valuesTitle'))}</h2>
  <p>${esc(t(locale, 'about.valuesDesc'))}</p>
  <div class="grid">${valuesHtml}</div>
</div>
<div class="section" style="text-align:center;padding:60px 24px">
  <h2>${esc(t(locale, 'about.joinTitle'))}</h2>
  <p>${esc(t(locale, 'about.joinDesc'))}</p>
  <a href="mailto:info@tutlio.lt" class="btn">${esc(t(locale, 'about.contactButton'))}</a>
</div>`;
}

function renderContacts(locale: Locale, _domain: DomainKey): string {
  return `
<div class="hero">
  <h1>${esc(t(locale, 'contact.title'))}</h1>
  <p>${esc(t(locale, 'contact.subtitle'))}</p>
</div>
<div class="section">
  <h2>${esc(t(locale, 'contact.ourContacts'))}</h2>
  <p>${esc(t(locale, 'contact.description'))}</p>
  <div style="margin-top:24px">
    <p><strong>Email:</strong> <a href="mailto:info@tutlio.lt">info@tutlio.lt</a></p>
  </div>
</div>`;
}

const PAGE_RENDERERS: Record<PageId, (locale: Locale, domain: DomainKey) => string> = {
  landing: renderLanding,
  pricing: renderPricing,
  about: renderAbout,
  contacts: renderContacts,
};

const PAGE_PATHS: Record<PageId, string> = {
  landing: '/',
  pricing: '/pricing',
  about: '/apie-mus',
  contacts: '/kontaktai',
};

const PAGE_TITLE_KEYS: Record<PageId, string> = {
  landing: 'landing.heroBadge',
  pricing: 'pricing.title',
  about: 'about.title',
  contacts: 'contact.title',
};

const PAGE_DESC_KEYS: Record<PageId, string> = {
  landing: 'landing.heroDesc',
  pricing: 'pricing.subtitle',
  about: 'about.subtitle',
  contacts: 'contact.description',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isSsrMethod(req.method)) return rejectSsrMethod(res);

  const page = (typeof req.query.page === 'string' ? req.query.page : 'landing') as PageId;
  if (!PAGE_RENDERERS[page]) return res.status(404).send('Not found');

  const domain = detectDomain(req);
  const locale = detectLocale(req);
  await preloadSsrLocales(locale, 'en', 'lt');
  const renderer = PAGE_RENDERERS[page];
  const path = PAGE_PATHS[page];

  const rawTitle = t(locale, PAGE_TITLE_KEYS[page]);
  const title = page === 'landing' ? `Tutlio - ${rawTitle}` : `${rawTitle} | Tutlio`;
  const description = t(locale, PAGE_DESC_KEYS[page]).replace(/<[^>]+>/g, '');

  const extraHead = page === 'landing'
    ? `<script>try{var k=Object.keys(localStorage);if(k.some(function(x){return x.startsWith("sb-")&&x.endsWith("-auth-token")}))window.location.replace("/dashboard")}catch(e){}</script>`
    : undefined;

  let jsonLd: string;
  if (page === 'landing') {
    const landingFaq = LANDING_FAQ_KEYS.map((f) => ({
      question: t(locale, `landing.faq.${f}Q`),
      answer: t(locale, `landing.faq.${f}A`),
    }));
    jsonLd = `${organizationJsonLd()}</script><script type="application/ld+json">${softwareAppJsonLd(locale)}</script><script type="application/ld+json">${faqJsonLd(landingFaq)}`;
  } else if (page === 'pricing') {
    const faqItems = ['trial', 'cancel', 'limit', 'payment', 'switch'].map((f) => ({
      question: t(locale, `pricing.faq.${f}Q`),
      answer: t(locale, `pricing.faq.${f}A`),
    }));
    jsonLd = `${webPageJsonLd({ name: title, description, url: buildCanonicalUrl(path, locale) })}</script><script type="application/ld+json">${faqJsonLd(faqItems)}`;
  } else {
    jsonLd = webPageJsonLd({ name: title, description, url: buildCanonicalUrl(path, locale) });
  }

  const homeUrl = buildCanonicalUrl('/', locale);
  const breadcrumbs = page === 'landing'
    ? undefined
    : [
        { name: 'Tutlio', url: homeUrl },
        { name: rawTitle, url: buildCanonicalUrl(path, locale) },
      ];

  const body = renderer(locale, domain);
  const html = renderShell({ locale, domain, path, title, description, body, jsonLd, extraHead, breadcrumbs });

  sendSsrHtml(req, res, html, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Language': locale,
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
  });
}
