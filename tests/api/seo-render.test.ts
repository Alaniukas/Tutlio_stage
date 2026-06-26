import { describe, expect, it } from 'vitest';
import schoolsRender from '../../api/schools-render.js';
import pageRender from '../../api/page-render.js';
import notFound from '../../api/not-found.js';
import robots from '../../api/robots.js';

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
  });
});

describe('page-render about/contact canonical slugs', () => {
  it('canonicalizes about to /about on .com with per-locale hreflang slugs', async () => {
    const res = mockRes();
    await pageRender(mockReq({ page: 'about', locale: 'en' }, 'www.tutlio.com'), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('<link rel="canonical" href="https://www.tutlio.com/about" />');
    expect(res.body).toContain('hreflang="lt" href="https://www.tutlio.lt/apie-mus"');
    expect(res.body).toContain('hreflang="pl" href="https://www.tutlio.pl/about"');
    expect(res.body).toContain('hreflang="x-default" href="https://www.tutlio.com/about"');
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
    }
  });
});
