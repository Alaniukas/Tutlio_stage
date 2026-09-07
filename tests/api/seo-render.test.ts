import { describe, expect, it } from 'vitest';
import schoolsRender from '../../api/schools-render.js';
import pageRender from '../../api/page-render.js';
import notFound from '../../api/not-found.js';
import robots from '../../api/robots.js';
import publicPageRender from '../../api/public-page-render.js';
import { PENDING_TRANSLATION_LOCALES, htmlLanguageCode, localeDirection } from '../../src/lib/i18n/locales';
import { t as ssrText } from '../../api/_lib/ssr-i18n';
import { localeAvailabilityParams } from '../../src/lib/i18n/localeAvailability';

function mockReq(query: Record<string, string>, host: string, method = 'GET') {
  return { method, query, headers: { host } } as any;
}

function mockRes() {
  const res = {
    statusCode: 0,
    body: '' as string,
    headers: {} as Record<string, string | number>,
    setHeader(key: string, value: string | number) {
      res.headers[key.toLowerCase()] = value;
      return res;
    },
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    send(payload: string) {
      res.body = payload;
      return res;
    },
    writeHead(code: number, headers?: Record<string, string>) {
      res.statusCode = code;
      Object.assign(res.headers, headers || {});
      return res;
    },
    end() {
      return res;
    },
    redirect(code: number, url: string) {
      res.statusCode = code;
      res.headers.location = url;
      return res;
    },
  };
  return res as any;
}

describe('schools-render', () => {
  it('serves the schools landing with /schools canonical and full hreflang cluster', async () => {
    const res = mockRes();
    await schoolsRender(mockReq({ page: 'landing', locale: 'en' }, 'www.tutlio.com'), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<meta name="robots" content="index, follow, max-image-preview:large" />');
    expect(res.body).toContain('<link rel="canonical" href="https://www.tutlio.com/schools" />');
    expect(res.body).toContain('href="https://www.tutlio.lt/schools"');
    expect(res.body).toContain('href="https://www.tutlio.pl/schools"');
    expect(res.body).toContain('hreflang="x-default" href="https://www.tutlio.com/schools"');
    expect(res.body).toContain('href="/schools/pricing"');
  });

  it('serves locale-nested schools pricing canonicals', async () => {
    const res = mockRes();
    await schoolsRender(mockReq({ page: 'pricing', locale: 'fr' }, 'www.tutlio.com'), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<link rel="canonical" href="https://www.tutlio.com/schools/fr/pricing" />');
    expect(res.body).toContain('lang="fr"');
  });

  it('rejects unknown schools pages', async () => {
    const res = mockRes();
    await schoolsRender(mockReq({ page: 'nope', locale: 'en' }, 'www.tutlio.com'), res);
    expect(res.statusCode).toBe(404);
    expect(res.headers['x-robots-tag']).toBe('noindex');
  });
});

describe('page-render about/contact canonical slugs', () => {
  it.each(PENDING_TRANSLATION_LOCALES)('renders the published %s locale as indexable with its own hreflang', async (locale) => {
    const res = mockRes();
    await pageRender(mockReq({ page: 'landing', locale }, 'www.tutlio.com'), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain(`lang="${htmlLanguageCode(locale)}" dir="${localeDirection(locale)}"`);
    if (locale === 'he') expect(res.body).toContain('property="og:locale" content="he_IL"');
    if (locale === 'ar') expect(res.body).toContain('property="og:locale" content="ar_SA"');
    expect(res.body).toContain('<meta name="robots" content="index, follow, max-image-preview:large" />');
    expect(res.body).toContain(`<link rel="canonical" href="https://www.tutlio.com/${locale}" />`);
    // Published since 2026-09-05: the copy must be the locale's own, not English.
    const escapeHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
    // `/` is the agency/school landing; the solo hero lives on /for-tutors.
    expect(res.body).toContain(`<h1>${escapeHtml(ssrText(locale, 'landing.v2.heroTitleBiz'))}${escapeHtml(ssrText(locale, 'landing.v2.heroTitleBizHighlight'))}</h1>`);
    expect(res.body).toContain(`href="/${locale}/for-tutors"`);
    expect(res.body).toContain(locale === 'uk' ? '>Блог</a>' : locale === 'bg' ? '>Блог</a>' : locale === 'th' ? '>บล็อก</a>' : locale === 'zh-hk' ? '>網誌</a>' : locale === 'he' ? '>בלוג</a>' : locale === 'ja' ? '>ブログ</a>' : locale === 'ko' ? '>블로그</a>' : locale === 'ar' ? '>المدونة</a>' : locale === 'el' ? '>Ιστολόγιο</a>' : '>Blog</a>');
    expect(res.body).toContain(locale === 'cs' ? '>Pro školy</a>' : locale === 'sl' ? '>Za šole</a>' : locale === 'hu' ? '>Iskoláknak</a>' : locale === 'hr' ? '>Za škole</a>' : locale === 'sk' ? '>Pre školy</a>' : locale === 'uk' ? '>Для шкіл</a>' : locale === 'bg' ? '>За училища</a>' : locale === 'th' ? '>สำหรับโรงเรียน</a>' : locale === 'zh-hk' ? '>學校專用</a>' : locale === 'he' ? '>לבתי ספר</a>' : locale === 'tr' ? '>Okullar için</a>' : locale === 'ja' ? '>学校向け</a>' : locale === 'fil' ? '>Para sa mga paaralan</a>' : locale === 'hi' ? '>स्कूलों के लिए</a>' : locale === 'ko' ? '>학교용</a>' : locale === 'id' ? '>Untuk sekolah</a>' : locale === 'ar' ? '>للمدارس</a>' : (locale === 'pt' || locale === 'pt-br') ? '>Para escolas</a>' : locale === 'ro' ? '>Pentru școli</a>' : locale === 'it' ? '>Per le scuole</a>' : locale === 'es-mx' ? '>Para escuelas</a>' : locale === 'el' ? '>Για σχολές</a>' : '>For Schools</a>');
    expect(res.body).not.toContain('>undefined</a>');
    expect(res.body).toContain(`hreflang="${htmlLanguageCode(locale)}" href="https://www.tutlio.com/${locale}"`);
  });

  it('emits localized search metadata and truthful structured data', async () => {
    const res = mockRes();
    await pageRender(mockReq({ page: 'landing', locale: 'fr' }, 'www.tutlio.com'), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<title>Logiciel de gestion des cours particuliers | Tutlio</title>');
    expect(res.body).toContain('<link rel="canonical" href="https://www.tutlio.com/fr" />');
    expect(res.body).toContain('"@type":"SoftwareApplication"');
    expect(res.body).toContain('"url":"https://www.tutlio.com/fr/pricing"');
    expect(res.body).toContain('"inLanguage":"fr"');
    expect(res.body).not.toContain('SearchAction');
    expect(res.body).not.toContain('"sameAs"');
  });

  it('renders the released 36-language list in HTML and FAQ structured data', async () => {
    const res = mockRes();
    await pageRender(mockReq({ page: 'landing', locale: 'en' }, 'www.tutlio.com'), res);

    const answer = ssrText('en', 'landing.faq.languagesA', localeAvailabilityParams('en'));
    expect(answer).toContain('36 languages');
    expect(res.body).toContain(`<p>${answer}</p>`);
    expect(res.body).toContain(JSON.stringify(answer).slice(1, -1));
    expect(res.body).not.toMatch(/\{(?:count|languages)\}/);
  });

  it('canonicalizes about to /about on .com with per-locale hreflang slugs', async () => {
    const res = mockRes();
    await pageRender(mockReq({ page: 'about', locale: 'en' }, 'www.tutlio.com'), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<link rel="canonical" href="https://www.tutlio.com/about" />');
    expect(res.body).toContain('hreflang="lt" href="https://www.tutlio.lt/apie-mus"');
    expect(res.body).toContain('hreflang="pl" href="https://www.tutlio.pl/about"');
    expect(res.body).toContain('hreflang="x-default" href="https://www.tutlio.com/about"');
    expect(res.body).toContain('class="breadcrumbs"');
    expect(res.body).toContain('href="https://www.tutlio.com/">Tutlio</a>');
    expect(res.body).toContain('"@id":"https://www.tutlio.com/about#breadcrumb"');
    expect(res.body).toContain('"inLanguage":"en"');
    expect(res.body).toContain('"isPartOf":{"@id":"https://www.tutlio.com/#website"}');
  });

  it('keeps /apie-mus canonical on the .lt domain', async () => {
    const res = mockRes();
    await pageRender(mockReq({ page: 'about', locale: 'lt' }, 'www.tutlio.lt'), res);
    expect(res.body).toContain('<link rel="canonical" href="https://www.tutlio.lt/apie-mus" />');
  });

  it('serves the Polish landing canonical on tutlio.pl without cross-domain locale footer', async () => {
    const res = mockRes();
    await pageRender(mockReq({ page: 'landing', locale: 'pl' }, 'www.tutlio.pl'), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<link rel="canonical" href="https://www.tutlio.pl/" />');
    expect(res.body).not.toContain('class="footer-langs"');
  });
});

describe('not-found handler', () => {
  it('returns a hard 404 with noindex', () => {
    const res = mockRes();
    notFound(mockReq({}, 'www.tutlio.com'), res);
    expect(res.statusCode).toBe(404);
    expect(res.headers['x-robots-tag']).toBe('noindex');
    expect(res.body).toContain('404');
  });
});

describe('public-page-render', () => {
  it('redirects a page to the canonical domain of its authored locale', async () => {
    const res = mockRes();
    await publicPageRender(
      mockReq({ slug: 'demo', locale: 'en', requestedPath: '/tutor/demo' }, 'www.tutlio.com'),
      res,
    );
    expect(res.statusCode).toBe(308);
    expect(res.headers.location).toBe('https://www.tutlio.lt/korepetitorius/demo');
  });

  it('renders semantic profile HTML without fabricated locale variants', async () => {
    const res = mockRes();
    await publicPageRender(
      mockReq({ slug: 'demo', locale: 'lt', requestedPath: '/korepetitorius/demo' }, 'www.tutlio.lt'),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<link rel="canonical" href="https://www.tutlio.lt/korepetitorius/demo" />');
    expect(res.body).toContain('"@type":"ProfilePage"');
    expect(res.body).toContain('"breadcrumb":{"@id":"https://www.tutlio.lt/korepetitorius/demo#breadcrumb"}');
    expect(res.body).toContain('<h1>Rasa Demo</h1>');
    expect(res.body).toContain('<h2>Atsiliepimai</h2>');
    expect(res.body).not.toContain('"aggregateRating"');
    expect(res.body).toContain('<meta name="robots" content="noindex, follow" />');
    expect(res.body).not.toContain('hreflang="fr"');
    expect(res.body).not.toContain('class="footer-langs"');
  });

  it('uses valid, visible aggregate ratings only for organization profiles', async () => {
    const res = mockRes();
    await publicPageRender(
      mockReq({ slug: 'demo-mokykla', locale: 'lt', requestedPath: '/korepetitorius/demo-mokykla' }, 'www.tutlio.lt'),
      res,
    );
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('"@type":"Organization"');
    expect(res.body).toContain('"aggregateRating"');
    expect(res.body).toContain('<strong>4.7/5</strong> · 61');
  });
});

describe('robots.txt per domain', () => {
  it('points each domain at its own sitemap', () => {
    for (const [host, sitemap] of [
      ['www.tutlio.com', 'https://www.tutlio.com/sitemap.xml'],
      ['www.tutlio.lt', 'https://www.tutlio.lt/sitemap.xml'],
      ['www.tutlio.pl', 'https://www.tutlio.pl/sitemap.xml'],
    ] as const) {
      const res = mockRes();
      robots(mockReq({}, host), res);
      expect(res.body).toContain(`Sitemap: ${sitemap}`);
      expect(res.body).toContain('Allow: /schools');
      expect(res.body).toContain('Allow: /tutor/');
    }
  });
});
