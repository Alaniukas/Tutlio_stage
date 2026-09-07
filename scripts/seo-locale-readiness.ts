/**
 * Search-readiness report for locales that are NOT yet published to search.
 *
 * Renders every crawler-facing marketing, schools, legal and comparison page
 * for each pending locale exactly as api/*-render.ts would serve it, then
 * compares the result with the English page: localized title, description and
 * H1, how much of the copy is still English (identical long H2s), dictionary
 * keys leaking into the page, and whether screenshots fall back to English.
 * The pass criteria mirror tests/api/seo-locale-parity.test.ts, so a locale
 * that is green here will pass that test once it is added to
 * SEO_LOCALES_BY_SURFACE in src/lib/i18n/localeRelease.ts.
 *
 *   npx tsx scripts/seo-locale-readiness.ts            # all pending locales
 *   npx tsx scripts/seo-locale-readiness.ts it pt-br   # a subset
 */
import pageRender from '../api/page-render.js';
import featureRender from '../api/feature-render.js';
import featuresIndexRender from '../api/features-index-render.js';
import schoolsRender from '../api/schools-render.js';
import legalRender from '../api/legal-render.js';
import { PENDING_TRANSLATION_LOCALES, type Locale } from '../src/lib/i18n/locales.js';
import { SEO_LOCALES_BY_SURFACE, hasLocalizedAssets } from '../src/lib/i18n/localeRelease.js';
import { getSeoMeta } from '../src/lib/seoMeta.js';
import { FEATURE_PAGES, FEATURE_PAGE_IDS } from '../src/lib/featurePages.js';

// Renderers must not reach a real database for related posts.
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.VITE_SUPABASE_URL = '';
process.env.SUPABASE_URL = '';

type Handler = (req: unknown, res: unknown) => Promise<unknown> | unknown;
interface PageSpec { id: string; surface: 'marketing' | 'schools' | 'legal'; handler: Handler; query: Record<string, string> }

const PAGES: PageSpec[] = [
  { id: 'landing', surface: 'marketing', handler: pageRender, query: { page: 'landing' } },
  { id: 'pricing', surface: 'marketing', handler: pageRender, query: { page: 'pricing' } },
  { id: 'about', surface: 'marketing', handler: pageRender, query: { page: 'about' } },
  { id: 'contacts', surface: 'marketing', handler: pageRender, query: { page: 'contacts' } },
  { id: 'features', surface: 'marketing', handler: featuresIndexRender, query: {} },
  ...FEATURE_PAGE_IDS.map((feature): PageSpec => ({ id: `feature:${feature}`, surface: 'marketing', handler: featureRender, query: { feature } })),
  { id: 'schools', surface: 'schools', handler: schoolsRender, query: { page: 'landing' } },
  { id: 'schools-pricing', surface: 'schools', handler: schoolsRender, query: { page: 'pricing' } },
  { id: 'privacy-policy', surface: 'legal', handler: legalRender, query: { page: 'privacy-policy' } },
  { id: 'terms', surface: 'legal', handler: legalRender, query: { page: 'terms' } },
  { id: 'dpa', surface: 'legal', handler: legalRender, query: { page: 'dpa' } },
];

function mockRes() {
  const res = {
    statusCode: 0, body: '', headers: {} as Record<string, string | number>,
    setHeader(k: string, v: string | number) { res.headers[k.toLowerCase()] = v; return res; },
    status(c: number) { res.statusCode = c; return res; },
    send(b: string) { res.body = String(b); return res; },
    writeHead(c: number, h?: Record<string, string>) { res.statusCode = c; Object.assign(res.headers, h || {}); return res; },
    end() { return res; }, json(o: unknown) { res.body = JSON.stringify(o); return res; },
    redirect(c: number, u: string) { res.statusCode = c; res.headers.location = u; return res; },
  };
  return res;
}

const COMPACT_SCRIPT = new Set<string>(['th', 'ja', 'zh-hk']);
const KEY_LEAK = /\b(landing|feature|featuresIndex|pricing|about|contact|schoolsLanding|schools|common|nav|footer|dpa|tos|priv|blog)\.[a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)+\b/;
const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const strip = (s: string) => decode(s.replace(/<[^>]+>/g, '')).trim();

interface Rendered { status: number; title: string; description: string; h1: string; h2: string[]; words: number; chars: number; leak: string | null; images: string[]; robots: string }

async function render(page: PageSpec, locale: Locale): Promise<Rendered> {
  const res = mockRes();
  await page.handler({ method: 'GET', query: { ...page.query, locale }, headers: { host: 'www.tutlio.com' } }, res);
  const html = res.body;
  const text = html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return {
    status: res.statusCode,
    title: decode((html.match(/<title>([^<]*)<\/title>/) || [])[1] || ''),
    description: decode((html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || ''),
    h1: strip((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || ''),
    h2: [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => strip(m[1])),
    words: text.split(' ').length,
    chars: text.length,
    leak: (text.match(KEY_LEAK) || [null])[0],
    images: [...html.matchAll(/<(?:img|source)[^>]+(?:src|srcset)="(\/[^"\s]+)"/g)].map((m) => m[1]),
    robots: (html.match(/<meta name="robots" content="([^"]*)"/) || [])[1] || '',
  };
}

const requested = process.argv.slice(2).filter((a) => !a.startsWith('-')) as Locale[];
const locales = (requested.length ? requested : [...PENDING_TRANSLATION_LOCALES]) as Locale[];

const en: Record<string, Rendered> = {};
for (const page of PAGES) en[page.id] = await render(page, 'en');

const pad = (s: string | number, n: number) => String(s).padEnd(n);
console.log('Pending locales: crawler pages rendered as www.tutlio.com/{locale}/... and compared with English.');
console.log('marketing = 12 pages (home, pricing, about, contacts, features hub, 7 feature pages); schools = 2; legal = 3.');
console.log('"EN title/H1" counts pages whose title, description or H1 is byte-identical to English. "EN H2s" counts long headings identical to English.');
console.log('');
console.log(pad('locale', 7) + pad('marketing', 11) + pad('EN title/H1', 13) + pad('EN H2s', 8) + pad('words vs EN', 13) + pad('schools', 9) + pad('legal', 9) + pad('leaks', 7) + pad('screens', 9) + 'verdict');

const summary: Record<string, string> = {};
for (const locale of locales) {
  let mkPages = 0, mkFallbackTitle = 0, mkEnH2 = 0, mkWordsRatio = 0, leaks = 0;
  let schoolsFallback = 0, legalFallback = 0;
  for (const page of PAGES) {
    const r = await render(page, locale);
    const e = en[page.id];
    if (r.status !== 200) { leaks += 1; continue; }
    const titleFallback = r.title === e.title || r.description === e.description || r.h1 === e.h1;
    const enH2 = r.h2.filter((h) => h.length > 20 && e.h2.includes(h)).length;
    if (r.leak) leaks += 1;
    if (page.surface === 'marketing') {
      mkPages += 1;
      if (titleFallback) mkFallbackTitle += 1;
      mkEnH2 += enH2;
      // Scripts without word spaces: compare character volume, with a lower bar (CJK/Thai text is far denser than English).
      mkWordsRatio += COMPACT_SCRIPT.has(locale) ? (r.chars / Math.max(1, e.chars)) / 0.35 : r.words / Math.max(1, e.words);
    } else if (page.surface === 'schools') {
      if (titleFallback || enH2 > 0) schoolsFallback += 1;
    } else if (titleFallback || r.words > 0 && Math.abs(r.words - e.words) < 5) {
      legalFallback += 1;
    }
  }
  const ratio = mkWordsRatio / Math.max(1, mkPages);
  const screens = hasLocalizedAssets(locale) ? 'own' : 'EN';
  const meta = getSeoMeta(locale, 'landing').title !== getSeoMeta('en', 'landing').title ? 'yes' : 'NO';
  const marketingReady = mkFallbackTitle === 0 && mkEnH2 === 0 && ratio >= 0.6 && leaks === 0 && meta === 'yes';
  const verdict = marketingReady
    ? `marketing READY${schoolsFallback ? '' : ' + schools'}${legalFallback ? ' (legal stays EN)' : ' + legal'}`
    : `not ready: ${[mkFallbackTitle && `${mkFallbackTitle} EN titles`, mkEnH2 && `${mkEnH2} EN headings`, ratio < 0.6 && 'thin', leaks && `${leaks} leaks`, meta === 'NO' && 'no search title'].filter(Boolean).join(', ')}`;
  summary[locale] = verdict;
  console.log(
    pad(locale, 7) + pad(`${mkPages - mkFallbackTitle}/${mkPages} ok`, 11) + pad(mkFallbackTitle, 13) + pad(mkEnH2, 8) +
    pad(`${Math.round(ratio * 100)}%`, 13) + pad(schoolsFallback ? `${schoolsFallback}/2 EN` : 'ok', 9) + pad(legalFallback ? `${legalFallback}/3 EN` : 'ok', 9) +
    pad(leaks, 7) + pad(screens, 9) + verdict,
  );
}

console.log('');
console.log(`Currently published to search (marketing surface): ${SEO_LOCALES_BY_SURFACE.marketing.join(' ')}`);
const ready = Object.entries(summary).filter(([, v]) => v.startsWith('marketing READY')).map(([l]) => l);
console.log(`Technically ready for the marketing surface right now: ${ready.length ? ready.join(' ') : 'none'}`);
console.log('Screens = "EN" means the locale reuses English screenshots (LOCALIZED_ASSET_LOCALES); alt text is localized.');
