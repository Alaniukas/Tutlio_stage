import type { VercelRequest, VercelResponse } from './types';
import { isSsrMethod, rejectSsrMethod, sendSsrHtml } from './_lib/ssr-http.js';
import {
  type Locale,
  type DomainKey,
  detectDomain,
  detectLocale,
  buildPath,
  buildCanonicalUrl,
  localizedPagePath,
  renderShell,
  preloadSsrLocales,
  t,
  esc,
  organizationJsonLd,
  websiteJsonLd,
  webPageJsonLd,
  faqJsonLd,
  softwareAppJsonLd,
  hreflangCode,
} from './_lib/ssr-shell.js';
import { TUTOR_PLANS, TUTOR_PLANS_USD, eur, usd } from '../src/lib/pricing.js';
import { isUsdLocale } from '../src/lib/localeCurrency.js';
import { SUBSCRIPTION_PLN } from '../src/lib/subscriptionPricing.js';
import { formatPln } from '../src/lib/formatPln.js';
import { getSeoMeta } from '../src/lib/seoMeta.js';
import { localeAvailabilityParams } from '../src/lib/i18n/localeAvailability.js';
import { FEATURE_PAGES } from '../src/lib/featurePages.js';

/**
 * `landing` (/) is the agency/school pitch, `for-tutors` the solo-tutor
 * pitch. The two audiences deliberately never share a URL and neither page
 * offers an audience toggle, so a crawler indexing the homepage reads a pure
 * B2B page and the B2C page ranks on its own.
 */
type PageId = 'landing' | 'for-tutors' | 'pricing' | 'about' | 'contacts';

function ssrPlanPrice(locale: Locale, plan: 'monthly' | 'yearly' | 'subscriptionOnly'): string {
  if (isUsdLocale(locale)) {
    const usdAmounts = {
      monthly: TUTOR_PLANS_USD.monthly.pricePerMonth,
      yearly: TUTOR_PLANS_USD.yearly.pricePerMonth,
      subscriptionOnly: TUTOR_PLANS_USD.subscriptionOnly.pricePerMonth,
    };
    return usd(usdAmounts[plan]);
  }
  if (locale === 'pl') {
    const amounts = {
      monthly: SUBSCRIPTION_PLN.monthly,
      yearly: SUBSCRIPTION_PLN.yearlyPerMonth,
      subscriptionOnly: SUBSCRIPTION_PLN.subscriptionOnly,
    };
    return formatPln(amounts[plan]);
  }
  const eurAmounts = {
    monthly: TUTOR_PLANS.monthly.pricePerMonthEur,
    yearly: TUTOR_PLANS.yearly.pricePerMonthEur,
    subscriptionOnly: TUTOR_PLANS.subscriptionOnly.pricePerMonthEur,
  };
  return eur(eurAmounts[plan]);
}

/** Sections mirror src/pages/NewLanding.tsx so crawlers and AI fetchers read
 * the same page humans see. Keep the two in sync when the marketing landing
 * changes. Placeholder social proof (LogoWall, CaseStudy, Testimonials) is
 * deliberately left out until it names attributable customers. */
const LANDING_OLD_TOOL_KEYS = ['spreadsheets', 'messages', 'calendar', 'reminders', 'contacts', 'calculator'];
const LANDING_PILLARS = [
  { titleKey: 'landing.insideStudents', subKey: 'landing.v2.pillar.studentsSub', path: '/features' },
  { titleKey: 'landing.feature.calendar', subKey: 'landing.v2.pillar.calendarSub', path: FEATURE_PAGES.calendar.path },
  { titleKey: 'landing.feature.payments', subKey: 'landing.v2.pillar.paymentsSub', path: FEATURE_PAGES.payments.path },
  { titleKey: 'landing.feature.waitlist', subKey: 'landing.v2.pillar.waitlistSub', path: FEATURE_PAGES.waitlist.path },
] as const;
const LANDING_WALK_STEPS = ['Schedule', 'Calendar', 'Payment', 'Invoice'] as const;
/** Mirrors the agency demo steps of src/components/landing/v2/VideoSection.tsx. */
const AGENCY_WALK_STEPS = ['Stats', 'Tutors', 'Payments', 'Messages', 'Parents'] as const;
const LANDING_FEATURE_CARDS: { key: string; isNew?: boolean }[] = [
  { key: 'digital-business-card', isNew: true },
  { key: 'calendar' },
  { key: 'waitlist' },
  { key: 'payments' },
  { key: 'reminders' },
  { key: 'cancellation' },
  { key: 'comments' },
];
/** Mirrors src/components/landing/v2/CustomizationSection.tsx. */
const CUSTOM_EXAMPLE_KEYS = ['ex1', 'ex2', 'ex3', 'ex4'] as const;

const LANDING_FAQ_KEYS = ['whatIs', 'whoFor', 'waitlist', 'freeTrial', 'languages'];

type LandingAudience = 'solo' | 'biz';

function landingSharedSections(locale: Locale, domain: DomainKey, audience: LandingAudience): {
  compareHtml: string;
  pillarsHtml: string;
  featuresHtml: string;
  faqHtml: string;
  finalHtml: string;
} {
  const languageParams = localeAvailabilityParams(locale);
  const pricingPath = buildPath('/pricing', locale, domain);
  const featuresPath = buildPath('/features', locale, domain);
  const contactsPath = buildPath(localizedPagePath('contacts', locale), locale, domain);
  const tx = (key: string, params?: Record<string, string | number>) => esc(t(locale, key, params));
  const audienceQuery = audience === 'biz' ? 'agency' : 'solo';

  const oldToolsHtml = LANDING_OLD_TOOL_KEYS.map((k) => `<li>${tx(`landing.v2.app.${k}`)}</li>`).join('');
  const oldPillsHtml = ['oldPill1', 'oldPill2', 'oldPill3'].map((k) => `<li>${tx(`landing.v2.${k}`)}</li>`).join('');
  const newPillsHtml = ['newPill1', 'newPill2'].map((k) => `<li>${tx(`landing.v2.${k}`)}</li>`).join('');

  const compareHtml = `<div class="section">
  <h2>${tx('landing.v2.compareTitle')}</h2>
  <p>${tx('landing.v2.compareSub')}</p>
  <div class="grid">
    <div class="card">
      <h3>${tx('landing.v2.oldWay')}</h3>
      <ul class="plain">${oldToolsHtml}</ul>
      <ul class="pills">${oldPillsHtml}</ul>
    </div>
    <div class="card">
      <h3>${tx('landing.v2.newWay')}</h3>
      <ul class="pills">${newPillsHtml}</ul>
    </div>
  </div>
</div>`;

  const pillarsHtml = `<div class="section">
  <h2>${tx('landing.v2.pillarsTitle')}</h2>
  <p>${tx('landing.v2.pillarsSub')}</p>
  <div class="grid">${LANDING_PILLARS
    .map(
      (p) => `<a href="${buildPath(p.path, locale, domain)}" class="card" style="text-decoration:none;color:inherit">
    <h3>${tx(p.titleKey)}</h3>
    <p>${tx(p.subKey)}</p>
  </a>`,
    )
    .join('\n')}</div>
  <p style="margin-top:24px"><a href="${featuresPath}">${tx('landing.v2.exploreAll')}</a></p>
</div>`;

  const featuresHtml = `<div class="section">
  <h2>${tx('landing.featuresTitle')}</h2>
  <p>${tx('landing.featuresDesc')}</p>
  <div class="grid">${LANDING_FEATURE_CARDS
    .map((f) => {
      const featurePath = buildPath(`/features/${f.key}`, locale, domain);
      return `<a href="${featurePath}" class="card" style="text-decoration:none;color:inherit">
    ${f.isNew ? `<p class="badge">${tx('featuresIndex.newBadge')}</p>` : ''}
    <h3>${tx(`landing.feature.${f.key}`)}</h3>
    <p>${tx(`landing.feature.${f.key}Desc`)}</p>
  </a>`;
    })
    .join('\n')}</div>
</div>`;

  const faqHtml = `<div class="section">
  <h2>${tx('landing.faqTitle')}</h2>
  <p>${tx('landing.v2.faqSub')}</p>
</div>
<div class="faq">${LANDING_FAQ_KEYS
    .map(
      (f) => `<details>
    <summary>${tx(`landing.faq.${f}Q`)}</summary>
    <p>${tx(`landing.faq.${f}A`, f === 'languages' ? languageParams : undefined)}</p>
  </details>`,
    )
    .join('\n')}
  <p style="margin-top:24px"><a href="${featuresPath}">${tx('landing.v2.exploreAll')}</a> &middot; <a href="${contactsPath}">${tx('common.contacts')}</a></p>
</div>`;

  const chipsHtml = ['chip1', 'chip2', 'chip3']
    .map((k) => `<li>${tx(`landing.v2.${k}`, k === 'chip3' ? { count: languageParams.count } : undefined)}</li>`)
    .join('');
  const finalHtml = `<div class="section" style="text-align:center;padding:60px 24px">
  <h2>${tx('landing.ctaTitle')}</h2>
  <p>${tx('landing.ctaDesc')}</p>
  <p><a href="${pricingPath}?audience=${audienceQuery}" class="btn">${tx('landing.startFree')}</a> <a href="${featuresPath}" class="btn btn-secondary">${tx('landing.v2.ctaSecondary')}</a></p>
  <ul class="chips">${chipsHtml}</ul>
</div>`;

  return { compareHtml, pillarsHtml, featuresHtml, faqHtml, finalHtml };
}

/** Solo landing (/for-tutors): mirrors NewLanding with audience="solo". */
function renderSoloLanding(locale: Locale, domain: DomainKey): string {
  const pricingPath = buildPath('/pricing', locale, domain);
  const contactsPath = buildPath(localizedPagePath('contacts', locale), locale, domain);
  const tx = (key: string, params?: Record<string, string | number>) => esc(t(locale, key, params));
  const shared = landingSharedSections(locale, domain, 'solo');

  const bentoHtml = [
    `<div class="card"><h3>${tx('landing.v2.bento2Title')}</h3><p>${tx('landing.v2.bento2Sub')}</p></div>`,
    `<div class="card"><h3>${tx('landing.v2.bento3Title')}</h3><p>${tx('landing.v2.bento3Sub')}</p></div>`,
    `<div class="card"><p class="badge">${tx('featuresIndex.newBadge')}</p><h3>${tx('landing.v2.bento4Title')}</h3><p>${tx('landing.v2.bento4Sub')}</p><p><a href="${buildPath(FEATURE_PAGES['digital-business-card'].path, locale, domain)}">${tx('landing.v2.businessCardCta')}</a></p></div>`,
    `<div class="card"><h3>${tx('landing.v2.bento5Title')}</h3><p>${tx('landing.v2.bento5Sub')}</p></div>`,
  ].join('\n');

  const stepsHtml = LANDING_WALK_STEPS
    .map(
      (step, i) => `<li class="card">
    <h3>${i + 1}. ${tx(`landing.v2.walkStep${step}`)}</h3>
    <p>${tx(`landing.v2.walkStep${step}Desc`)}</p>
  </li>`,
    )
    .join('\n');

  return `
<div class="hero">
  <h1>${tx('landing.v2.heroTitleSolo')}${tx('landing.v2.heroTitleSoloHighlight')}</h1>
  <p>${tx('landing.v2.heroSubSolo')}</p>
  <a href="${pricingPath}?audience=solo" class="btn">${tx('landing.v2.heroCtaSolo')}</a>
  <p class="hero-note">${tx('landing.v2.heroTrial')}</p>
</div>
${shared.compareHtml}
<div class="section">
  <h2>${tx('landing.v2.bento1Title')}</h2>
  <p>${tx('landing.v2.bento1Sub')}</p>
  <div class="grid">${bentoHtml}</div>
</div>
<div class="section">
  <div class="card">
    <h3>${tx('landing.custom.soloTitle')}</h3>
    <p>${tx('landing.custom.soloNote')}</p>
    <p><a href="${contactsPath}">${tx('landing.custom.cta')}</a></p>
  </div>
</div>
${shared.pillarsHtml}
${shared.featuresHtml}
<div class="section">
  <h2>${tx('landing.v2.videoTitleSolo')}</h2>
  <p>${tx('landing.v2.videoSubSolo')}</p>
  <ol class="grid steps">${stepsHtml}</ol>
</div>
${shared.faqHtml}
${shared.finalHtml}`;
}

/** Agency/school landing (/): mirrors NewLanding with audience="biz". */
function renderAgencyLanding(locale: Locale, domain: DomainKey): string {
  const pricingPath = buildPath('/pricing', locale, domain);
  const contactsPath = buildPath(localizedPagePath('contacts', locale), locale, domain);
  const tx = (key: string, params?: Record<string, string | number>) => esc(t(locale, key, params));
  const shared = landingSharedSections(locale, domain, 'biz');

  const bentoHtml = [
    `<div class="card"><h3>${tx('landing.v2.bento2Title')}</h3><p>${tx('landing.v2.bento2Sub')}</p></div>`,
    `<div class="card"><h3>${tx('landing.v2.bento3Title')}</h3><p>${tx('landing.v2.bento3Sub')}</p></div>`,
    `<div class="card"><h3>${tx('landing.v2.bento4TitleBiz')}</h3><p>${tx('landing.v2.bento4SubBiz')}</p></div>`,
    `<div class="card"><h3>${tx('landing.v2.bento5Title')}</h3><p>${tx('landing.v2.bento5Sub')}</p></div>`,
  ].join('\n');

  const examplesHtml = CUSTOM_EXAMPLE_KEYS
    .map(
      (k) => `<div class="card">
    <h3>${tx(`landing.custom.${k}Title`)}</h3>
    <p>${tx(`landing.custom.${k}Desc`)}</p>
  </div>`,
    )
    .join('\n');

  const stepsHtml = AGENCY_WALK_STEPS
    .map(
      (step, i) => `<li class="card">
    <h3>${i + 1}. ${tx(`landing.v2.animBiz${step}`)}</h3>
    <p>${tx(`landing.v2.animBiz${step}Desc`)}</p>
  </li>`,
    )
    .join('\n');

  return `
<div class="hero">
  <h1>${tx('landing.v2.heroTitleBiz')}${tx('landing.v2.heroTitleBizHighlight')}</h1>
  <p>${tx('landing.v2.heroSubBiz')}</p>
  <a href="${pricingPath}?audience=agency" class="btn">${tx('landing.v2.heroCtaBiz')}</a>
</div>
${shared.compareHtml}
<div class="section">
  <h2>${tx('landing.v2.bento1Title')}</h2>
  <p>${tx('landing.v2.bento1Sub')}</p>
  <div class="grid">${bentoHtml}</div>
</div>
<div class="section">
  <h2>${tx('landing.custom.title')}</h2>
  <p>${tx('landing.custom.sub')}</p>
  <div class="grid">${examplesHtml}</div>
  <p style="margin-top:24px">${tx('landing.custom.note')}</p>
  <p><a href="${contactsPath}" class="btn">${tx('landing.custom.cta')}</a></p>
</div>
${shared.pillarsHtml}
${shared.featuresHtml}
<div class="section">
  <h2>${tx('landing.v2.videoTitleBiz')}</h2>
  <p>${tx('landing.v2.videoSubBiz')}</p>
  <ol class="grid steps">${stepsHtml}</ol>
</div>
${shared.faqHtml}
${shared.finalHtml}`;
}

function renderPricing(locale: Locale, domain: DomainKey): string {
  const features = [
    'digitalBusinessCard', 'calendar', 'waitlist', 'payments', 'reminders', 'comments',
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
      <p style="font-size:2rem;font-weight:700;margin:12px 0">${ssrPlanPrice(locale, 'monthly')}<span style="font-size:.9rem;font-weight:400;color:#666">/mo</span></p>
      <p>${esc(t(locale, 'pricing.monthlyDesc'))}</p>
      <a href="${registerPath}" class="btn" style="margin-top:16px">${esc(t(locale, 'pricing.start7DayTrial'))}</a>
    </div>
    <div class="card">
      <h3>${esc(t(locale, 'pricing.yearly'))}</h3>
      <p style="font-size:2rem;font-weight:700;margin:12px 0">${ssrPlanPrice(locale, 'yearly')}<span style="font-size:.9rem;font-weight:400;color:#666">/mo</span></p>
      <p>${esc(t(locale, 'pricing.yearlyDesc'))}</p>
      <a href="${registerPath}" class="btn" style="margin-top:16px">${esc(t(locale, 'pricing.start7DayTrial'))}</a>
    </div>
    <div class="card">
      <h3>${esc(t(locale, 'pricing.subscriptionOnly'))}</h3>
      <p style="font-size:2rem;font-weight:700;margin:12px 0">${ssrPlanPrice(locale, 'subscriptionOnly')}<span style="font-size:.9rem;font-weight:400;color:#666">/mo</span></p>
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
  landing: renderAgencyLanding,
  'for-tutors': renderSoloLanding,
  pricing: renderPricing,
  about: renderAbout,
  contacts: renderContacts,
};

/** Canonical path per locale - about/contact slugs are domain-flavored. */
const PAGE_PATHS: Record<PageId, (locale: Locale) => string> = {
  landing: () => '/',
  'for-tutors': () => '/for-tutors',
  pricing: () => '/pricing',
  about: (locale) => localizedPagePath('about', locale),
  contacts: (locale) => localizedPagePath('contacts', locale),
};

const PAGE_TITLE_KEYS: Record<PageId, string> = {
  landing: 'landing.heroBadge',
  'for-tutors': 'nav.forTutors',
  pricing: 'pricing.title',
  about: 'about.title',
  contacts: 'contact.title',
};

const PAGE_DESC_KEYS: Record<PageId, string> = {
  landing: 'landing.heroDesc',
  'for-tutors': 'landing.v2.heroSubSolo',
  pricing: 'pricing.subtitle',
  about: 'about.subtitle',
  contacts: 'contact.description',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isSsrMethod(req.method)) return rejectSsrMethod(res);

  const page = (typeof req.query.page === 'string' ? req.query.page : 'landing') as PageId;
  if (!PAGE_RENDERERS[page]) {
    res.setHeader('X-Robots-Tag', 'noindex');
    return res.status(404).send('Not found');
  }

  const domain = detectDomain(req);
  const locale = detectLocale(req);
  await preloadSsrLocales(locale, 'en', 'lt');
  const renderer = PAGE_RENDERERS[page];
  const path = PAGE_PATHS[page](locale);
  const urlFor = (l: Locale) => buildCanonicalUrl(PAGE_PATHS[page](l), l);

  const rawTitle = t(locale, PAGE_TITLE_KEYS[page]);
  const coreMeta = page === 'landing' || page === 'pricing'
    ? getSeoMeta(locale, page)
    : page === 'for-tutors'
      ? getSeoMeta(locale, 'forTutors')
      : null;
  const title = coreMeta?.title || `${rawTitle} | Tutlio`;
  const description = coreMeta?.description || t(locale, PAGE_DESC_KEYS[page]).replace(/<[^>]+>/g, '');

  const extraHead = page === 'landing'
    ? `<script>try{var k=Object.keys(localStorage);if(k.some(function(x){return x.startsWith("sb-")&&x.endsWith("-auth-token")}))window.location.replace("/dashboard")}catch(e){}</script>`
    : undefined;

  let jsonLd: string;
  if (page === 'landing' || page === 'for-tutors') {
    const languageParams = localeAvailabilityParams(locale);
    const landingFaq = LANDING_FAQ_KEYS.map((f) => ({
      question: t(locale, `landing.faq.${f}Q`),
      answer: t(locale, `landing.faq.${f}A`, f === 'languages' ? languageParams : undefined),
    }));
    // The homepage carries the site-wide Organization/WebSite graph; both
    // landings describe the same product, so both carry SoftwareApplication.
    const head = page === 'landing'
      ? `${organizationJsonLd(locale)}</script><script type="application/ld+json">${websiteJsonLd(locale)}`
      : webPageJsonLd({ locale, name: title, description, url: buildCanonicalUrl(path, locale) });
    jsonLd = `${head}</script><script type="application/ld+json">${softwareAppJsonLd(locale)}</script><script type="application/ld+json">${faqJsonLd(landingFaq)}`;
  } else if (page === 'pricing') {
    const faqItems = ['trial', 'cancel', 'limit', 'payment', 'switch'].map((f) => ({
      question: t(locale, `pricing.faq.${f}Q`),
      answer: t(locale, `pricing.faq.${f}A`),
    }));
    jsonLd = `${webPageJsonLd({ locale, name: title, description, url: buildCanonicalUrl(path, locale) })}</script><script type="application/ld+json">${faqJsonLd(faqItems)}`;
  } else {
    jsonLd = webPageJsonLd({ locale, name: title, description, url: buildCanonicalUrl(path, locale) });
  }

  const homeUrl = buildCanonicalUrl('/', locale);
  const breadcrumbs = page === 'landing'
    ? undefined
    : [
        { name: 'Tutlio', url: homeUrl },
        { name: rawTitle, url: buildCanonicalUrl(path, locale) },
      ];

  const body = renderer(locale, domain);
  const html = renderShell({ locale, domain, path, title, description, body, jsonLd, extraHead, breadcrumbs, urlFor });

  sendSsrHtml(req, res, html, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Language': hreflangCode(locale),
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
  });
}
