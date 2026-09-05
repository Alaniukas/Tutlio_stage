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
  webPageJsonLd,
  faqJsonLd,
  hreflangCode,
} from './_lib/ssr-shell.js';
import {
  type ComparisonPageId,
  COMPARE_FAQ_INDEXES,
  COMPARE_GLANCE_KEYS,
  COMPARE_HUB_PATH,
  COMPARE_REASON_INDEXES,
  COMPARE_REVIEWED_ON,
  COMPARE_ROWS,
  COMPARISON_PAGE_IDS,
  COMPARISON_PAGES,
  type CompareCell,
  isComparisonPageId,
} from '../src/lib/comparisonPages.js';
import { formatReviewedDate } from '../src/lib/compareReviewedDate.js';

const CELL_MARK: Record<CompareCell['value'], string> = {
  yes: '&#10003;',
  partial: '&#9679;',
  no: '&#10007;',
  na: '&mdash;',
  text: '',
};

const CELL_COLOR: Record<CompareCell['value'], string> = {
  yes: '#047857',
  partial: '#b45309',
  no: '#b91c1c',
  na: '#9ca3af',
  text: '#1a1a1a',
};

function cellHtml(cell: CompareCell, locale: Locale): string {
  const legendKey = cell.value === 'text' ? '' : `compare.legend.${cell.value}`;
  const note = cell.noteKey ? t(locale, cell.noteKey) : cell.note || '';
  const label = legendKey ? t(locale, legendKey) : note;
  const mark = CELL_MARK[cell.value];
  const noteHtml = note && cell.value !== 'text' ? `<span style="display:block;font-size:.8rem;color:#6b7280">${esc(note)}</span>` : '';
  return `<td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top;color:${CELL_COLOR[cell.value]}">${mark ? `<span aria-hidden="true" style="font-weight:700;margin-right:6px">${mark}</span>` : ''}<span${cell.value === 'text' ? '' : ' class="sr-only" style="position:absolute;left:-10000px"'}>${esc(label)}</span>${noteHtml}</td>`;
}

const TABLE_STYLE = 'width:100%;border-collapse:collapse;font-size:.95rem;margin-top:16px';
const TH_STYLE = 'text-align:left;padding:10px 12px;border-bottom:2px solid #e5e7eb;font-weight:600';

/** "The big difference" band - mirrors src/components/landing/v2/BigDifferenceBand.tsx. */
function bigDifferenceHtml(locale: Locale, domain: DomainKey): string {
  const tx = (key: string) => esc(t(locale, key));
  const contactsPath = buildPath(localizedPagePath('contacts', locale), locale, domain);
  const chips = [1, 2, 3, 4]
    .map((n) => `<li style="background:rgba(255,255,255,.14);color:#fff">${tx(`compare.customChip${n}`)}</li>`)
    .join('');
  return `<div class="section">
  <div class="card" style="background:linear-gradient(135deg,#1e1b4b 0%,#3730a3 55%,#6d28d9 100%);color:#fff;border-color:transparent;padding:36px 32px">
    <h2 style="color:#fff;font-size:1.9rem;line-height:1.2">${tx('compare.customTitle')}</h2>
    <p style="color:#e0e7ff;font-size:1rem;max-width:720px">${tx('compare.customBody')}</p>
    <ul class="pills">${chips}</ul>
    <p style="margin-top:20px"><a href="${contactsPath}" class="btn" style="background:#fff;color:#1e1b4b">${tx('compare.customCta')}</a></p>
  </div>
</div>`;
}

function renderComparison(id: ComparisonPageId, locale: Locale, domain: DomainKey): string {
  const cfg = COMPARISON_PAGES[id];
  const p = cfg.keyPrefix;
  const params = { name: cfg.name, date: formatReviewedDate(locale, COMPARE_REVIEWED_ON) };
  const tx = (key: string) => esc(t(locale, key, params));
  const pricingPath = buildPath('/pricing', locale, domain);
  const homePath = buildPath('/', locale, domain);
  const soloPath = buildPath('/for-tutors', locale, domain);

  const glanceRows = COMPARE_GLANCE_KEYS
    .map(
      (k) => `<tr>
    <th scope="row" style="${TH_STYLE};border-bottom:1px solid #e5e7eb;font-weight:600;color:#555;width:22%">${tx(`compare.glance.${k}`)}</th>
    <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top">${tx(`compare.tutlio.glance.${k}`)}</td>
    <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;vertical-align:top">${tx(`compare.${p}.glance.${k}`)}</td>
  </tr>`,
    )
    .join('\n');

  const matrixRows = COMPARE_ROWS
    .map(
      (row) => `<tr>
    <th scope="row" style="${TH_STYLE};border-bottom:1px solid #e5e7eb;font-weight:500;width:40%">${tx(`compare.row.${row.key}`)}</th>
    ${cellHtml(row.tutlio, locale)}
    ${cellHtml(row.competitors[id], locale)}
  </tr>`,
    )
    .join('\n');

  const reasons = (prefix: 'tutlioFor' | 'themFor') =>
    COMPARE_REASON_INDEXES.map((n) => `<li>${tx(`compare.${p}.${prefix}${n}`)}</li>`).join('\n');

  const faqHtml = COMPARE_FAQ_INDEXES
    .map(
      (n) => `<details>
    <summary>${tx(`compare.${p}.faq.q${n}`)}</summary>
    <p>${tx(`compare.${p}.faq.a${n}`)}</p>
  </details>`,
    )
    .join('\n');

  const othersHtml = COMPARISON_PAGE_IDS.filter((other) => other !== id)
    .map((other) => `<a href="${buildPath(COMPARISON_PAGES[other].path, locale, domain)}" class="card" style="text-decoration:none;color:inherit"><h3>${esc(t(locale, 'compare.vsTitle', { name: COMPARISON_PAGES[other].name }))}</h3><p>${esc(t(locale, 'compare.hub.cardCta'))} →</p></a>`)
    .join('\n');

  const legend = (['yes', 'partial', 'no', 'na'] as const)
    .map((v) => `<li><span aria-hidden="true" style="color:${CELL_COLOR[v]};font-weight:700">${CELL_MARK[v]}</span> ${tx(`compare.legend.${v}`)}</li>`)
    .join('');

  return `
<div class="hero">
  <p class="badge">${tx('compare.hub.badge')}</p>
  <h1>${tx('compare.vsTitle')}</h1>
  <p>${tx(`compare.${p}.intro1`)}</p>
  <p>${tx(`compare.${p}.intro2`)}</p>
  <p><a href="${pricingPath}?audience=solo" class="btn">${tx('compare.ctaSolo')}</a> <a href="${pricingPath}?audience=agency" class="btn btn-secondary">${tx('compare.ctaAgency')}</a></p>
  <p class="hero-note">${tx('compare.reviewed')}</p>
</div>
${bigDifferenceHtml(locale, domain)}
<div class="section">
  <h2>${tx('compare.glanceTitle')}</h2>
  <table style="${TABLE_STYLE}">
    <thead><tr><th style="${TH_STYLE}"></th><th scope="col" style="${TH_STYLE}">Tutlio</th><th scope="col" style="${TH_STYLE}">${esc(cfg.name)}</th></tr></thead>
    <tbody>${glanceRows}</tbody>
  </table>
</div>
<div class="section">
  <h2>${tx('compare.matrixTitle')}</h2>
  <p>${tx('compare.matrixSub')}</p>
  <table style="${TABLE_STYLE}">
    <thead><tr><th style="${TH_STYLE}"></th><th scope="col" style="${TH_STYLE}">Tutlio</th><th scope="col" style="${TH_STYLE}">${esc(cfg.name)}</th></tr></thead>
    <tbody>${matrixRows}</tbody>
  </table>
  <ul class="plain" style="margin-top:16px">${legend}</ul>
</div>
<div class="section">
  <div class="grid">
    <div class="card"><h3>${tx('compare.chooseTutlio')}</h3><ul style="padding-left:18px;color:#555">${reasons('tutlioFor')}</ul></div>
    <div class="card"><h3>${tx('compare.chooseThem')}</h3><ul style="padding-left:18px;color:#555">${reasons('themFor')}</ul></div>
  </div>
</div>
<div class="section">
  <h2>${tx('compare.faqTitle')}</h2>
</div>
<div class="faq">${faqHtml}</div>
<div class="section">
  <h2>${tx('compare.switchTitle')}</h2>
  <p>${tx('compare.switchBody')}</p>
  <p><strong>${tx(`compare.${p}.verdict`)}</strong></p>
</div>
<div class="section">
  <h2>${tx('compare.otherTitle')}</h2>
  <div class="grid">${othersHtml}</div>
  <p style="margin-top:16px"><a href="${buildPath(COMPARE_HUB_PATH, locale, domain)}">${tx('compare.hub.title')}</a> &middot; <a href="${soloPath}">${tx('landing.v2.audienceSolo')}</a> &middot; <a href="${homePath}">${tx('landing.v2.audienceBiz')}</a></p>
</div>
<div class="section" style="text-align:center;padding:60px 24px">
  <h2>${tx('compare.ctaTitle')}</h2>
  <p>${tx('compare.ctaSub')}</p>
  <p><a href="${pricingPath}?audience=solo" class="btn">${tx('compare.ctaSolo')}</a> <a href="${pricingPath}?audience=agency" class="btn btn-secondary">${tx('compare.ctaAgency')}</a></p>
  <p class="hero-note" style="max-width:760px;margin:24px auto 0;font-size:.8rem">${tx('compare.disclaimer')}</p>
</div>`;
}

function renderHub(locale: Locale, domain: DomainKey): string {
  const tx = (key: string, params?: Record<string, string | number>) => esc(t(locale, key, params));
  const pricingPath = buildPath('/pricing', locale, domain);
  const cards = COMPARISON_PAGE_IDS
    .map((id) => {
      const cfg = COMPARISON_PAGES[id];
      return `<a href="${buildPath(cfg.path, locale, domain)}" class="card" style="text-decoration:none;color:inherit">
    <h3>${tx('compare.vsTitle', { name: cfg.name })}</h3>
    <p>${tx(`compare.${cfg.keyPrefix}.glance.bestFor`)}</p>
    <p style="margin-top:12px;color:#4f46e5;font-weight:600;font-size:.9rem">${tx('compare.hub.cardCta')} →</p>
  </a>`;
    })
    .join('\n');

  return `
<div class="hero">
  <h1>${tx('compare.hub.title')}</h1>
  <p>${tx('compare.hub.subtitle')}</p>
</div>
${bigDifferenceHtml(locale, domain)}
<div class="section">
  <div class="grid">${cards}</div>
</div>
<div class="section" style="text-align:center;padding:60px 24px">
  <h2>${tx('compare.ctaTitle')}</h2>
  <p>${tx('compare.ctaSub')}</p>
  <p><a href="${pricingPath}?audience=solo" class="btn">${tx('compare.ctaSolo')}</a> <a href="${pricingPath}?audience=agency" class="btn btn-secondary">${tx('compare.ctaAgency')}</a></p>
</div>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isSsrMethod(req.method)) return rejectSsrMethod(res);

  const requested = typeof req.query.competitor === 'string' ? req.query.competitor : '';
  if (requested && !isComparisonPageId(requested)) {
    res.setHeader('X-Robots-Tag', 'noindex');
    return res.status(404).send('Not found');
  }
  const competitor: ComparisonPageId | null = requested && isComparisonPageId(requested) ? requested : null;

  const domain = detectDomain(req);
  const locale = detectLocale(req);
  await preloadSsrLocales(locale, 'en', 'lt');

  const homeUrl = buildCanonicalUrl('/', locale);
  const hubUrl = buildCanonicalUrl(COMPARE_HUB_PATH, locale);

  if (!competitor) {
    const title = t(locale, 'compare.hub.metaTitle');
    const description = t(locale, 'compare.hub.metaDesc');
    const body = renderHub(locale, domain);
    const html = renderShell({
      locale,
      domain,
      path: COMPARE_HUB_PATH,
      title,
      description,
      body,
      jsonLd: webPageJsonLd({ locale, name: title, description, url: hubUrl }),
      breadcrumbs: [
        { name: 'Tutlio', url: homeUrl },
        { name: t(locale, 'compare.hub.badge'), url: hubUrl },
      ],
    });
    sendSsrHtml(req, res, html, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Language': hreflangCode(locale),
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    });
    return;
  }

  const cfg = COMPARISON_PAGES[competitor];
  const params = { name: cfg.name, date: formatReviewedDate(locale, COMPARE_REVIEWED_ON) };
  const title = t(locale, 'compare.metaTitle', params);
  const description = t(locale, `compare.${cfg.keyPrefix}.metaDesc`, params);
  const canonicalUrl = buildCanonicalUrl(cfg.path, locale);
  const faqItems = COMPARE_FAQ_INDEXES.map((n) => ({
    question: t(locale, `compare.${cfg.keyPrefix}.faq.q${n}`, params),
    answer: t(locale, `compare.${cfg.keyPrefix}.faq.a${n}`, params),
  }));
  const jsonLd = `${webPageJsonLd({ locale, name: title, description, url: canonicalUrl })}</script><script type="application/ld+json">${faqJsonLd(faqItems)}`;

  const body = renderComparison(competitor, locale, domain);
  const html = renderShell({
    locale,
    domain,
    path: cfg.path,
    title,
    description,
    body,
    jsonLd,
    breadcrumbs: [
      { name: 'Tutlio', url: homeUrl },
      { name: t(locale, 'compare.hub.badge'), url: hubUrl },
      { name: t(locale, 'compare.vsTitle', { name: cfg.name }), url: canonicalUrl },
    ],
  });

  sendSsrHtml(req, res, html, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Language': hreflangCode(locale),
    'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
  });
}
