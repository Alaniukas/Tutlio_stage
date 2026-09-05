import { beforeAll, describe, expect, it, vi } from 'vitest';
import compareRender from '../../api/compare-render.js';
import pageRender from '../../api/page-render.js';
import robots from '../../api/robots.js';
import llmsHandler from '../../api/llms-txt.js';
import { COMPARISON_PAGE_IDS, COMPARISON_PAGES, COMPARE_REVIEWED_ON } from '../../src/lib/comparisonPages.js';
import { formatReviewedDate } from '../../src/lib/compareReviewedDate.js';
import { getSeoMeta } from '../../src/lib/seoMeta.js';
import { t as ssrText } from '../../api/_lib/ssr-i18n.js';

function mockReq(query: Record<string, string>, host: string, method = 'GET') {
  return { method, query, headers: { host }, url: '/llms.txt' } as any;
}

function mockRes() {
  const res = {
    statusCode: 0,
    body: '' as string,
    headers: {} as Record<string, string | number>,
    setHeader(key: string, value: string | number) { res.headers[key.toLowerCase()] = value; return res; },
    status(code: number) { res.statusCode = code; return res; },
    send(payload: string) { res.body = String(payload); return res; },
    end() { return res; },
  };
  return res as any;
}

const KEY_LEAK = /\b(landing|compare|nav|common|pricing)\.[a-zA-Z0-9]+(?:\.[a-zA-Z0-9]+)+\b/;
/** Money amounts must never appear on a comparison page. */
const PRICE = /(?:€|US\$|\$|zł)\s?\d|\d\s?(?:€|zł)/;
const EM_DASH = '—';

/** Titles are HTML-escaped by the shell ("Tutors & Schools" becomes "&amp;"). */
const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
}

beforeAll(() => {
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
  vi.stubEnv('VITE_SUPABASE_URL', '');
  vi.stubEnv('SUPABASE_URL', '');
});

describe('landing audience split', () => {
  it('serves the agency pitch on / with no audience toggle and no hero badge', async () => {
    const res = mockRes();
    await pageRender(mockReq({ page: 'landing', locale: 'en' }, 'www.tutlio.com'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<link rel="canonical" href="https://www.tutlio.com/" />');
    expect(res.body).toContain(`<title>${escHtml(getSeoMeta('en', 'landing').title)}</title>`);
    expect(res.body).toContain(`<h1>${ssrText('en', 'landing.v2.heroTitleBiz')}${ssrText('en', 'landing.v2.heroTitleBizHighlight')}</h1>`);
    expect(res.body).not.toContain(ssrText('en', 'landing.v2.heroTitleSolo'));
    expect(res.body).not.toContain('audience-switch');
    const heroStart = res.body.indexOf('<div class="hero">');
    const hero = res.body.slice(heroStart, res.body.indexOf('</div>', heroStart));
    expect(hero).not.toContain(ssrText('en', 'landing.v2.heroPill'));
    expect(hero).not.toContain('/for-tutors');
    expect(res.body).toContain('href="/pricing?audience=agency"');
    // The "big difference" section with its anonymised examples. No eyebrow
    // badge above the heading — removed on request.
    expect(res.body).toContain(`<h2>${ssrText('en', 'landing.custom.title')}</h2>`);
    expect(res.body).toContain(ssrText('en', 'landing.custom.ex1Title'));
    expect(res.body).toContain(ssrText('en', 'landing.custom.ex4Title'));
    expect(res.body).toContain('href="/compare"');
    // No customer-account screenshot; the SPA draws its own calendar mock.
    expect(res.body).not.toContain('/landing/calendar-');
    expect(res.body).toContain('"@type":"SoftwareApplication"');
    expect(res.body).toContain('"@type":"FAQPage"');
    // The solo page is reachable from the footer only.
    expect(res.body).toContain('href="/for-tutors"');
    expect(visibleText(res.body)).not.toMatch(KEY_LEAK);
    expect(visibleText(res.body)).not.toContain(EM_DASH);
  });

  it('serves the solo pitch on /for-tutors with its own metadata and hreflang cluster', async () => {
    const res = mockRes();
    await pageRender(mockReq({ page: 'for-tutors', locale: 'en' }, 'www.tutlio.com'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<meta name="robots" content="index, follow, max-image-preview:large" />');
    expect(res.body).toContain('<link rel="canonical" href="https://www.tutlio.com/for-tutors" />');
    expect(res.body).toContain(`<title>${escHtml(getSeoMeta('en', 'forTutors').title)}</title>`);
    expect(res.body).toContain(`<h1>${ssrText('en', 'landing.v2.heroTitleSolo')}${ssrText('en', 'landing.v2.heroTitleSoloHighlight')}</h1>`);
    expect(res.body).not.toContain(ssrText('en', 'landing.v2.heroTitleBiz'));
    expect(res.body).toContain('hreflang="lt" href="https://www.tutlio.lt/for-tutors"');
    expect(res.body).toContain('hreflang="pl" href="https://www.tutlio.pl/for-tutors"');
    expect(res.body).toContain('hreflang="de" href="https://www.tutlio.com/de/for-tutors"');
    expect(res.body).toContain('hreflang="x-default" href="https://www.tutlio.com/for-tutors"');
    expect(res.body).toContain('href="/pricing?audience=solo"');
    expect(res.body).toContain('"@type":"SoftwareApplication"');
    expect(res.body).toContain('"@type":"FAQPage"');
    expect(res.body).toContain('"@id":"https://www.tutlio.com/for-tutors#breadcrumb"');
    expect(res.body).toContain(ssrText('en', 'landing.custom.soloNote'));
    expect(res.body).not.toContain('/landing/calendar-');
    expect(visibleText(res.body)).not.toMatch(KEY_LEAK);
  });

  it('localizes the solo landing on the Lithuanian and Polish domains', async () => {
    const lt = mockRes();
    await pageRender(mockReq({ page: 'for-tutors', locale: 'lt' }, 'www.tutlio.lt'), lt);
    expect(lt.body).toContain('<link rel="canonical" href="https://www.tutlio.lt/for-tutors" />');
    expect(lt.body).toContain(`<title>${escHtml(getSeoMeta('lt', 'forTutors').title)}</title>`);
    expect(lt.body).toContain('href="/pricing?audience=solo"');

    const pl = mockRes();
    await pageRender(mockReq({ page: 'for-tutors', locale: 'pl' }, 'www.tutlio.pl'), pl);
    expect(pl.body).toContain('<link rel="canonical" href="https://www.tutlio.pl/for-tutors" />');
    expect(pl.body).not.toContain('class="footer-langs"');
  });
});

describe('compare-render', () => {
  it('renders the hub with links to every comparison and the big-difference band', async () => {
    const res = mockRes();
    await compareRender(mockReq({ locale: 'en' }, 'www.tutlio.com'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<link rel="canonical" href="https://www.tutlio.com/compare" />');
    expect(res.body).toContain(`<h1>${ssrText('en', 'compare.hub.title')}</h1>`);
    for (const id of COMPARISON_PAGE_IDS) {
      expect(res.body).toContain(`href="${COMPARISON_PAGES[id].path}"`);
    }
    // No eyebrow badge above "The big difference" heading, and no standalone
    // "Compare" pill above the hub's own heading — both removed on request.
    expect(res.body).not.toContain(ssrText('en', 'compare.customEyebrow'));
    expect(res.body).not.toContain(`<p class="badge">${ssrText('en', 'compare.hub.badge')}</p>`);
    expect(res.body).toContain(`<h2 style="color:#fff;font-size:1.9rem;line-height:1.2">${ssrText('en', 'compare.customTitle')}</h2>`);
    expect(res.body).toContain('hreflang="lt" href="https://www.tutlio.lt/compare"');
    expect(res.body).toContain('hreflang="pl" href="https://www.tutlio.pl/compare"');
    expect(res.body).not.toContain('hreflang="de"');
    expect(visibleText(res.body)).not.toMatch(KEY_LEAK);
  });

  it.each(COMPARISON_PAGE_IDS)('renders an indexable, self-canonical %s comparison with FAQ schema, no prices and a trademark notice', async (id) => {
    const res = mockRes();
    await compareRender(mockReq({ competitor: id, locale: 'en' }, 'www.tutlio.com'), res);
    const cfg = COMPARISON_PAGES[id];
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-language']).toBe('en');
    expect(res.body).toContain('<meta name="robots" content="index, follow, max-image-preview:large" />');
    expect(res.body).toContain(`<link rel="canonical" href="https://www.tutlio.com${cfg.path}" />`);
    expect(res.body).toContain(`<title>Tutlio vs ${cfg.name}: tutoring software compared | Tutlio</title>`);
    expect(res.body).toContain(`<h1>Tutlio vs ${cfg.name}</h1>`);
    expect(res.body).toContain('"@type":"FAQPage"');
    expect(res.body).toContain('"@type":"BreadcrumbList"');
    expect(res.body).toContain(`"@id":"https://www.tutlio.com${cfg.path}#breadcrumb"`);
    expect(res.body).toContain(`${cfg.name} is a trademark of its respective owner`);
    expect(res.body).toContain(formatReviewedDate('en', COMPARE_REVIEWED_ON));
    // The big-difference band sits right under the hero, before the tables,
    // with no eyebrow badge above its heading — removed on request.
    const bandAt = res.body.indexOf(ssrText('en', 'compare.customTitle'));
    const glanceAt = res.body.indexOf(`<h2>${ssrText('en', 'compare.glanceTitle')}</h2>`);
    expect(bandAt).toBeGreaterThan(0);
    expect(bandAt).toBeLessThan(glanceAt);
    expect(res.body).toContain(ssrText('en', 'compare.customChip1'));
    expect(res.body).not.toContain(ssrText('en', 'compare.customEyebrow'));
    // Only the three domain languages are alternates; everything else is absent.
    expect(res.body).toContain(`hreflang="lt" href="https://www.tutlio.lt${cfg.path}"`);
    expect(res.body).toContain(`hreflang="pl" href="https://www.tutlio.pl${cfg.path}"`);
    expect(res.body).toContain(`hreflang="x-default" href="https://www.tutlio.com${cfg.path}"`);
    expect(res.body).not.toContain('hreflang="de"');
    expect(res.body).not.toContain('hreflang="fr"');
    // Links to the other comparisons and both landing pages.
    for (const other of COMPARISON_PAGE_IDS.filter((o) => o !== id)) {
      expect(res.body).toContain(`href="${COMPARISON_PAGES[other].path}"`);
    }
    expect(res.body).toContain('href="/for-tutors"');
    const text = visibleText(res.body);
    expect(text).not.toMatch(KEY_LEAK);
    expect(text).not.toMatch(/\{(?:name|date|monthly|yearly|licence|adminFee|noCommission)\}/);
    expect(text).not.toMatch(/\bundefined\b/);
    expect(text, 'comparison pages carry no price figures').not.toMatch(PRICE);
    expect(text).not.toContain(EM_DASH);
  });

  it.each(['lt', 'pl'] as const)('renders native %s copy on its own domain', async (locale) => {
    const host = locale === 'lt' ? 'www.tutlio.lt' : 'www.tutlio.pl';
    const res = mockRes();
    await compareRender(mockReq({ competitor: 'tutorcruncher', locale }, host), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain(`<link rel="canonical" href="https://${host}/compare/tutorcruncher" />`);
    expect(res.body).toContain('<meta name="robots" content="index, follow, max-image-preview:large" />');
    expect(res.body).toContain(`<title>${escHtml(ssrText(locale, 'compare.metaTitle', { name: 'TutorCruncher' }))}</title>`);
    expect(res.body).not.toContain(ssrText('en', 'compare.tutorcruncher.intro1'));
    expect(res.body).toContain(ssrText(locale, 'compare.tutorcruncher.intro1'));
    expect(res.body).toContain(ssrText(locale, 'compare.customTitle'));
    expect(res.body).not.toContain(ssrText(locale, 'compare.customEyebrow'));
    const text = visibleText(res.body);
    expect(text).not.toMatch(KEY_LEAK);
    expect(text).not.toMatch(/\{(?:name|date)\}/);
    expect(text).not.toMatch(PRICE);
    expect(text).not.toContain(EM_DASH);
  });

  it('keeps unpublished locales out of the index without breaking the page', async () => {
    const res = mockRes();
    await compareRender(mockReq({ competitor: 'teachworks', locale: 'de' }, 'www.tutlio.com'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<meta name="robots" content="noindex, follow" />');
    expect(res.body).toContain('<link rel="canonical" href="https://www.tutlio.com/de/compare/teachworks" />');
  });

  it('rejects unknown competitors with a noindex 404', async () => {
    const res = mockRes();
    await compareRender(mockReq({ competitor: 'nope', locale: 'en' }, 'www.tutlio.com'), res);
    expect(res.statusCode).toBe(404);
    expect(res.headers['x-robots-tag']).toBe('noindex');
  });

  it('is allowed by robots.txt and advertised in llms.txt', () => {
    const robotsRes = mockRes();
    robots(mockReq({}, 'www.tutlio.com'), robotsRes);
    expect(robotsRes.body).toContain('Allow: /for-tutors');
    expect(robotsRes.body).toContain('Allow: /compare');

    for (const host of ['www.tutlio.com', 'www.tutlio.lt', 'www.tutlio.pl']) {
      const llms = mockRes();
      llmsHandler(mockReq({}, host), llms);
      expect(llms.body).toContain(`https://${host}/for-tutors`);
      expect(llms.body).toContain(`https://${host}/compare`);
    }
  });
});
