import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { TUTOR_PLANS, eur } from '../../src/lib/pricing.js';
import llmsHandler from '../../api/llms-txt.js';
import feedHandler from '../../api/blog-feed.js';
import { INDEXNOW_KEY } from '../../api/indexnow-ping.js';
import { softwareAppJsonLd, renderShell } from '../../api/_lib/ssr-shell.js';
import { config as middlewareConfig } from '../../middleware.js';
import { t, isLocaleLoaded, loadLocaleDict } from '../../src/lib/i18n/core.js';

const ROOT = process.cwd();

function mockRes() {
  const headers: Record<string, string> = {};
  const res = {
    statusCode: 200,
    body: '',
    headers,
    setHeader(k: string, v: string) {
      headers[k.toLowerCase()] = v;
      return res;
    },
    status(c: number) {
      res.statusCode = c;
      return res;
    },
    send(b: string) {
      res.body = String(b);
      return res;
    },
    json(o: unknown) {
      res.body = JSON.stringify(o);
      return res;
    },
  };
  return res;
}

describe('plan pricing has a single source of truth', () => {
  it('formats euro amounts the way the UI always has', () => {
    expect(eur(19.99)).toBe('€19.99');
    expect(eur(14.99)).toBe('€14.99');
    expect(eur(35)).toBe('€35');
  });

  it('leaves no hardcoded euro plan prices in files that consume the constants', () => {
    const files = [
      'src/pages/Pricing.tsx',
      'src/pages/TutorSubscribe.tsx',
      'src/pages/Settings.tsx',
      'api/page-render.ts',
      'api/llms-txt.ts',
      'api/_lib/ssr-shell.ts',
    ];
    for (const file of files) {
      const content = readFileSync(path.join(ROOT, file), 'utf8');
      expect(/€\d/.test(content), `${file} contains a hardcoded € price`).toBe(false);
      expect(content.includes('lib/pricing'), `${file} should import from lib/pricing`).toBe(true);
    }
  });

  it('llms.txt quotes the same prices humans see (the €9.99 staleness bug)', () => {
    const res = mockRes();
    llmsHandler({ url: '/llms.txt', method: 'GET', headers: {}, query: {} } as any, res as any);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain(`**Monthly**: ${eur(TUTOR_PLANS.monthly.pricePerMonthEur)}/month`);
    expect(res.body).toContain(`**Yearly**: ${eur(TUTOR_PLANS.yearly.pricePerMonthEur)}/month`);
    expect(res.body).toContain(`**Subscription Only**: ${eur(TUTOR_PLANS.subscriptionOnly.pricePerMonthEur)}/month`);
    expect(res.body).not.toMatch(/€9\.99/);
    expect(res.body).toContain('https://www.tutlio.com/blog/rss.xml');
  });

  it('SoftwareApplication JSON-LD offers mirror the constants', () => {
    const jsonLd = JSON.parse(softwareAppJsonLd('en'));
    const prices = jsonLd.offers.map((o: { price: string }) => o.price);
    expect(prices).toEqual([
      TUTOR_PLANS.monthly.pricePerMonthEur.toFixed(2),
      TUTOR_PLANS.yearly.pricePerMonthEur.toFixed(2),
      TUTOR_PLANS.subscriptionOnly.pricePerMonthEur.toFixed(2),
    ]);
  });
});

describe('blog RSS feed', () => {
  const ENV_KEYS = ['VITE_SUPABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const saved: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterAll(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] !== undefined) process.env[k] = saved[k];
    }
  });

  it('serves a valid RSS channel in the domain default locale', async () => {
    const res = mockRes();
    await feedHandler({ method: 'GET', headers: { host: 'www.tutlio.com' }, query: {} } as any, res as any);
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/rss+xml');
    expect(res.body).toContain('<rss version="2.0"');
    expect(res.body).toContain('<link>https://www.tutlio.com/blog</link>');
    expect(res.body).toContain('<language>en</language>');
  });

  it('serves locale-specific feeds with canonical URLs', async () => {
    const res = mockRes();
    await feedHandler({ method: 'GET', headers: { host: 'www.tutlio.com' }, query: { locale: 'fr' } } as any, res as any);
    expect(res.body).toContain('<link>https://www.tutlio.com/fr/blog</link>');
    expect(res.body).toContain('<language>fr</language>');
    expect(res.body).toContain('href="https://www.tutlio.com/fr/blog/rss.xml"');
  });

  it('falls back to the domain locale for invalid locale params', async () => {
    const res = mockRes();
    await feedHandler({ method: 'GET', headers: { host: 'www.tutlio.pl' }, query: { locale: 'nope' } } as any, res as any);
    expect(res.body).toContain('<language>pl</language>');
    expect(res.body).toContain('<link>https://www.tutlio.pl/blog</link>');
  });

  it('rejects non-GET methods', async () => {
    const res = mockRes();
    await feedHandler({ method: 'POST', headers: { host: 'www.tutlio.com' }, query: {} } as any, res as any);
    expect(res.statusCode).toBe(405);
  });

  it('is wired into vercel.json with autodiscovery in the SSR shell', () => {
    const vercel = JSON.parse(readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    const sources = vercel.rewrites.map((r: { source: string }) => r.source);
    expect(sources).toContain('/blog/rss.xml');
    expect(sources).toContain('/:locale/blog/rss.xml');
    expect(vercel.functions['api/blog-feed.ts']).toBeTruthy();

    const html = renderShell({
      locale: 'en',
      domain: 'com',
      path: '/',
      title: 'T',
      description: 'D',
      body: '<p>x</p>',
    });
    expect(html).toContain('type="application/rss+xml"');
    expect(html).toContain('https://www.tutlio.com/blog/rss.xml');
  });
});

describe('IndexNow', () => {
  it('hosts the key file matching the handler key', () => {
    const keyFile = path.join(ROOT, 'public', `${INDEXNOW_KEY}.txt`);
    expect(existsSync(keyFile), `public/${INDEXNOW_KEY}.txt missing`).toBe(true);
    expect(readFileSync(keyFile, 'utf8').trim()).toBe(INDEXNOW_KEY);
  });

  it('runs on a cron schedule', () => {
    const vercel = JSON.parse(readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    const cron = vercel.crons.find((c: { path: string }) => c.path === '/api/indexnow-ping');
    expect(cron).toBeTruthy();
  });
});

describe('middleware catch-all matcher (soft-404 elimination)', () => {
  it('keeps the expected matcher entries', () => {
    expect(middlewareConfig.matcher).toEqual(['/', '/((?!api/|assets/)(?!.*\\.).*)']);
  });

  it('matches page-like paths at any depth and skips files/api/assets', () => {
    const pattern = middlewareConfig.matcher[1];
    const re = new RegExp(`^${pattern.replace('((?!', '(?:(?!')}$`);

    for (const p of ['/pricing', '/en/removed-page', '/lt/blog/foo', '/schools/pricing', '/a/b/c', '/whiteboard/room-1']) {
      expect(re.test(p), `${p} should be matched`).toBe(true);
    }
    for (const p of ['/api/robots', '/assets/index-abc.js', '/sitemap.xml', '/blog/rss.xml', `/${INDEXNOW_KEY}.txt`, '/favicon.ico']) {
      expect(re.test(p), `${p} should NOT be matched`).toBe(false);
    }
  });
});

describe('lazy locale dictionaries', () => {
  it('bundles the three domain-default locales eagerly', () => {
    expect(isLocaleLoaded('lt')).toBe(true);
    expect(isLocaleLoaded('en')).toBe(true);
    expect(isLocaleLoaded('pl')).toBe(true);
  });

  it('falls back to English until a lazy dictionary loads, then serves it', async () => {
    expect(isLocaleLoaded('fr')).toBe(false);
    const before = t('fr', 'blog.subtitle');
    expect(before).toBe(t('en', 'blog.subtitle'));

    await loadLocaleDict('fr');
    expect(isLocaleLoaded('fr')).toBe(true);
    const after = t('fr', 'blog.subtitle');
    expect(after).not.toBe(t('en', 'blog.subtitle'));
    expect(after.length).toBeGreaterThan(0);
  });
});
