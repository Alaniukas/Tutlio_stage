import { beforeAll, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import pageRender from '../../api/page-render.js';
import featureRender from '../../api/feature-render.js';
import featuresIndexRender from '../../api/features-index-render.js';
import compareRender from '../../api/compare-render.js';
import schoolsRender from '../../api/schools-render.js';
import legalRender from '../../api/legal-render.js';
import sitemapHandler from '../../api/sitemap.js';
import { SEO_LOCALES_BY_SURFACE, type SeoSurface } from '../../src/lib/i18n/localeRelease.js';
import { LOCALE_FORMAT_TAGS, localeDirection } from '../../src/lib/i18n/locales.js';
import {
  type Locale,
  buildCanonicalUrl,
  buildPlatformCanonicalUrl,
  canonicalDomain,
  hreflangCode,
  localizedPagePath,
} from '../../api/_lib/seo-routing.js';
import { FEATURE_PAGES, FEATURE_PAGE_IDS } from '../../src/lib/featurePages.js';
import { COMPARE_HUB_PATH, COMPARISON_PAGES, COMPARISON_PAGE_IDS } from '../../src/lib/comparisonPages.js';

/**
 * Locale parity for the international domain.
 *
 * Every search-published locale on www.tutlio.com must receive the same
 * crawler contract as English: a localized title, description and H1, a
 * self-canonical URL, the complete reciprocal hreflang cluster, the same
 * structured-data types, localized screenshots that actually exist, and no
 * dictionary keys or English fallback leaking into the page. The matrix is
 * derived from localeRelease.ts, so releasing a new locale to search
 * automatically subjects it to these checks.
 */

const ROOT = process.cwd();
const HOST = 'www.tutlio.com';

type Handler = (req: unknown, res: unknown) => Promise<unknown> | unknown;

interface PageSpec {
  id: string;
  surface: SeoSurface;
  handler: Handler;
  query: Record<string, string>;
  canonical: (locale: Locale) => string;
}

const PAGES: PageSpec[] = [
  { id: 'landing', surface: 'marketing', handler: pageRender, query: { page: 'landing' }, canonical: (l) => buildCanonicalUrl('/', l) },
  { id: 'for-tutors', surface: 'marketing', handler: pageRender, query: { page: 'for-tutors' }, canonical: (l) => buildCanonicalUrl('/for-tutors', l) },
  { id: 'pricing', surface: 'marketing', handler: pageRender, query: { page: 'pricing' }, canonical: (l) => buildCanonicalUrl('/pricing', l) },
  { id: 'about', surface: 'marketing', handler: pageRender, query: { page: 'about' }, canonical: (l) => buildCanonicalUrl(localizedPagePath('about', l), l) },
  { id: 'contacts', surface: 'marketing', handler: pageRender, query: { page: 'contacts' }, canonical: (l) => buildCanonicalUrl(localizedPagePath('contacts', l), l) },
  { id: 'features', surface: 'marketing', handler: featuresIndexRender, query: {}, canonical: (l) => buildCanonicalUrl('/features', l) },
  ...FEATURE_PAGE_IDS.map((feature): PageSpec => ({
    id: `feature:${feature}`,
    surface: 'marketing',
    handler: featureRender,
    query: { feature },
    canonical: (l) => buildCanonicalUrl(FEATURE_PAGES[feature].path, l),
  })),
  { id: 'compare', surface: 'compare', handler: compareRender, query: {}, canonical: (l) => buildCanonicalUrl(COMPARE_HUB_PATH, l) },
  ...COMPARISON_PAGE_IDS.map((competitor): PageSpec => ({
    id: `compare:${competitor}`,
    surface: 'compare',
    handler: compareRender,
    query: { competitor },
    canonical: (l) => buildCanonicalUrl(COMPARISON_PAGES[competitor].path, l),
  })),
  { id: 'schools', surface: 'schools', handler: schoolsRender, query: { page: 'landing' }, canonical: (l) => buildPlatformCanonicalUrl('/schools', '/', l) },
  { id: 'schools-pricing', surface: 'schools', handler: schoolsRender, query: { page: 'pricing' }, canonical: (l) => buildPlatformCanonicalUrl('/schools', '/pricing', l) },
  { id: 'legal:privacy-policy', surface: 'legal', handler: legalRender, query: { page: 'privacy-policy' }, canonical: (l) => buildCanonicalUrl('/privacy-policy', l) },
  { id: 'legal:terms', surface: 'legal', handler: legalRender, query: { page: 'terms' }, canonical: (l) => buildCanonicalUrl('/terms', l) },
  { id: 'legal:dpa', surface: 'legal', handler: legalRender, query: { page: 'dpa' }, canonical: (l) => buildCanonicalUrl('/dpa', l) },
];

const COM_LOCALES: Record<SeoSurface, Locale[]> = {
  marketing: SEO_LOCALES_BY_SURFACE.marketing.filter((l) => canonicalDomain(l) === 'com'),
  schools: SEO_LOCALES_BY_SURFACE.schools.filter((l) => canonicalDomain(l) === 'com'),
  legal: SEO_LOCALES_BY_SURFACE.legal.filter((l) => canonicalDomain(l) === 'com'),
  compare: SEO_LOCALES_BY_SURFACE.compare.filter((l) => canonicalDomain(l) === 'com'),
  publicPage: [],
  blog: [],
};

function mockReq(query: Record<string, string>, host = HOST) {
  return { method: 'GET', query, headers: { host } } as any;
}

function mockRes() {
  const res = {
    statusCode: 0,
    body: '',
    headers: {} as Record<string, string | number>,
    setHeader(key: string, value: string | number) { res.headers[key.toLowerCase()] = value; return res; },
    status(code: number) { res.statusCode = code; return res; },
    send(payload: string) { res.body = String(payload); return res; },
    writeHead(code: number, headers?: Record<string, string>) { res.statusCode = code; Object.assign(res.headers, headers || {}); return res; },
    end() { return res; },
    json(o: unknown) { res.body = JSON.stringify(o); return res; },
    redirect(code: number, url: string) { res.statusCode = code; res.headers.location = url; return res; },
  };
  return res;
}

interface Rendered {
  status: number;
  contentLanguage: string;
  lang: string;
  dir: string;
  title: string;
  description: string;
  robots: string;
  canonical: string;
  ogLocale: string;
  hreflang: Record<string, string>;
  jsonLdTypes: string[];
  inLanguages: string[];
  h1: string;
  h2: string[];
  images: string[];
  text: string;
  words: number;
}

function attr(html: string, re: RegExp): string {
  const m = html.match(re);
  return m ? m[1] : '';
}

function decode(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&middot;/g, '·');
}

function collectTypes(node: unknown, types: string[], langs: string[]) {
  if (Array.isArray(node)) { node.forEach((n) => collectTypes(n, types, langs)); return; }
  if (!node || typeof node !== 'object') return;
  const o = node as Record<string, unknown>;
  if (typeof o['@type'] === 'string') types.push(o['@type']);
  if (typeof o.inLanguage === 'string') langs.push(o.inLanguage);
  for (const v of Object.values(o)) if (v && typeof v === 'object') collectTypes(v, types, langs);
}

function parse(res: ReturnType<typeof mockRes>): Rendered {
  const html = res.body;
  const hreflang: Record<string, string> = {};
  for (const m of html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)) hreflang[m[1]] = decode(m[2]);
  const jsonLdTypes: string[] = [];
  const inLanguages: string[] = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const parsed = JSON.parse(m[1]);
    collectTypes(parsed, jsonLdTypes, inLanguages);
  }
  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    status: res.statusCode,
    contentLanguage: String(res.headers['content-language'] || ''),
    lang: attr(html, /<html lang="([^"]*)"/),
    dir: attr(html, /<html lang="[^"]*" dir="([^"]*)"/),
    title: decode(attr(html, /<title>([^<]*)<\/title>/)),
    description: decode(attr(html, /<meta name="description" content="([^"]*)"/)),
    robots: attr(html, /<meta name="robots" content="([^"]*)"/),
    canonical: decode(attr(html, /<link rel="canonical" href="([^"]*)"/)),
    ogLocale: attr(html, /<meta property="og:locale" content="([^"]*)"/),
    hreflang,
    jsonLdTypes: [...new Set(jsonLdTypes)].sort(),
    inLanguages,
    h1: decode(attr(html, /<h1[^>]*>([\s\S]*?)<\/h1>/).replace(/<[^>]+>/g, '')).trim(),
    h2: [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => decode(m[1].replace(/<[^>]+>/g, '')).trim()),
    images: [...html.matchAll(/<(?:img|source)[^>]+(?:src|srcset)="(\/[^"\s]+)"/g)].map((m) => m[1]),
    text,
    words: text.split(' ').length,
  };
}

async function render(page: PageSpec, locale: Locale): Promise<Rendered> {
  const res = mockRes();
  await page.handler(mockReq({ ...page.query, locale }), res);
  return parse(res);
}

const COMPACT_SCRIPT = new Set<string>(['th', 'ja', 'zh-hk']);
const KEY_LEAK = /\b(landing|feature|featuresIndex|pricing|about|contact|schoolsLanding|schools|common|nav|footer|dpa|tos|priv|blog|compare)\.[a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)+\b/;
const OG_LOCALE = (l: Locale) => LOCALE_FORMAT_TAGS[l].split('-u-')[0].replace('-', '_');

const cache = new Map<string, Rendered>();
async function get(page: PageSpec, locale: Locale): Promise<Rendered> {
  const key = `${page.id}:${locale}`;
  if (!cache.has(key)) cache.set(key, await render(page, locale));
  return cache.get(key)!;
}

beforeAll(() => {
  // Related-post lookups and the sitemap must not reach a real database here.
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_URL', '');
});

describe('tutlio.com locale parity', () => {
  it('publishes at least English plus the ten legacy locales on .com', () => {
    expect(COM_LOCALES.marketing).toContain('en');
    expect(COM_LOCALES.marketing.length).toBeGreaterThanOrEqual(11);
  });

  for (const page of PAGES) {
    const locales = COM_LOCALES[page.surface];
    const nonEnglish = locales.filter((l) => l !== 'en');

    describe(page.id, () => {
      it.each(locales)('%s renders an indexable, self-canonical, correctly labelled page', async (locale) => {
        const r = await get(page, locale);
        expect(r.status).toBe(200);
        expect(r.robots).toBe('index, follow, max-image-preview:large');
        expect(r.canonical).toBe(page.canonical(locale));
        expect(r.lang).toBe(hreflangCode(locale));
        expect(r.dir).toBe(localeDirection(locale));
        expect(r.contentLanguage).toBe(hreflangCode(locale));
        expect(r.ogLocale).toBe(OG_LOCALE(locale));
        expect(r.title).toContain('Tutlio');
        const compact = COMPACT_SCRIPT.has(locale);
        expect(r.title.length).toBeGreaterThan(compact ? 6 : 12);
        expect(r.description.length).toBeGreaterThan(compact ? 12 : 30);
        expect(r.h1.length).toBeGreaterThan(3);
      });

      it.each(locales)('%s carries the full reciprocal hreflang cluster', async (locale) => {
        const r = await get(page, locale);
        const en = await get(page, 'en');
        const cluster = SEO_LOCALES_BY_SURFACE[page.surface].map(hreflangCode).sort();
        const present = Object.keys(r.hreflang).filter((k) => k !== 'x-default').sort();
        expect(present).toEqual(cluster);
        expect(r.hreflang['x-default']).toBe(page.canonical('en'));
        expect(r.hreflang[hreflangCode(locale)]).toBe(r.canonical);
        // English must point back at this locale's canonical and vice versa.
        expect(en.hreflang[hreflangCode(locale)]).toBe(r.canonical);
        expect(r.hreflang.en).toBe(en.canonical);
      });

      it.each(nonEnglish)('%s is localized, not English served under another lang code', async (locale) => {
        const r = await get(page, locale);
        const en = await get(page, 'en');
        expect(r.title, `title falls back to English for ${locale}`).not.toBe(en.title);
        expect(r.description, `description falls back to English for ${locale}`).not.toBe(en.description);
        expect(r.h1, `H1 falls back to English for ${locale}`).not.toBe(en.h1);
        if (COMPACT_SCRIPT.has(locale)) {
          // No word spaces in these scripts: a character count is the only volume signal, and it runs far denser than English.
          expect(r.text.length, `${locale} page is far shorter than English`).toBeGreaterThanOrEqual(Math.floor(en.text.length * 0.2));
        } else {
          expect(r.words, `${locale} page is far shorter than English`).toBeGreaterThanOrEqual(Math.floor(en.words * 0.5));
        }
      });

      it.each(locales)('%s leaks no dictionary keys and references only screenshots that exist', async (locale) => {
        const r = await get(page, locale);
        const leak = r.text.match(KEY_LEAK);
        expect(leak, `untranslated key on ${page.id}/${locale}: ${leak?.[0]}`).toBeNull();
        expect(r.text).not.toMatch(/\bundefined\b/);
        for (const src of r.images) {
          const file = path.join(ROOT, 'public', src.split('?')[0]);
          expect(existsSync(file), `${page.id}/${locale} references missing asset ${src}`).toBe(true);
        }
      });

      it.each(nonEnglish)('%s ships the same structured-data types as English, in its own language', async (locale) => {
        const r = await get(page, locale);
        const en = await get(page, 'en');
        expect(r.jsonLdTypes).toEqual(en.jsonLdTypes);
        for (const lang of r.inLanguages) expect(lang).toBe(hreflangCode(locale));
      });
    });
  }

  it('sitemap lists every .com locale for the money pages with a 14-link alternate cluster', async () => {
    const res = mockRes();
    await sitemapHandler(mockReq({}), res);
    expect(res.statusCode).toBe(200);
    const xml = res.body;
    for (const locale of COM_LOCALES.marketing) {
      for (const p of ['/', '/for-tutors', '/pricing', '/features']) {
        const loc = buildCanonicalUrl(p, locale);
        expect(xml, `sitemap misses ${loc}`).toContain(`<loc>${loc}</loc>`);
      }
      const schools = buildPlatformCanonicalUrl('/schools', '/', locale);
      expect(xml, `sitemap misses ${schools}`).toContain(`<loc>${schools}</loc>`);
      const home = buildCanonicalUrl('/', locale);
      const block = xml.slice(xml.indexOf(`<loc>${home}</loc>`));
      const entry = block.slice(0, block.indexOf('</url>'));
      const alternates = (entry.match(/hreflang="/g) || []).length;
      expect(alternates, `home entry for ${locale} has ${alternates} alternates`).toBe(SEO_LOCALES_BY_SURFACE.marketing.length + 1);
    }
  });
});
