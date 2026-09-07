#!/usr/bin/env node
/**
 * Production SEO smoke check — verifies the crawler-facing contract on the
 * live domains after every deploy (SSR for crawlers, noindex SPA for browser
 * navigations,
 * canonical redirects, hard 404s, sitemap/robots/feed/llms endpoints).
 *
 * Usage:
 *   npm run seo:smoke                       # all three domains
 *   npm run seo:smoke -- https://www.tutlio.lt   # one domain
 */

const GOOGLEBOT =
  'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/125.0 Safari/537.36';
const HUMAN =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

const INDEXNOW_KEY = '8f3e9f035b622995d5cb1b8cc7f0aa7f';

const DEFAULTS = ['https://www.tutlio.com', 'https://www.tutlio.lt', 'https://www.tutlio.pl'];
const ALIAS_SLUG = { 'www.tutlio.com': '/apie-mus', 'www.tutlio.pl': '/apie-mus', 'www.tutlio.lt': '/about' };
const CANONICAL_SLUG = { 'www.tutlio.com': '/about', 'www.tutlio.pl': '/about', 'www.tutlio.lt': '/apie-mus' };
const DEFAULT_LOCALE = { 'www.tutlio.com': 'en', 'www.tutlio.pl': 'pl', 'www.tutlio.lt': 'lt' };
/** A locale canonical on another domain + where its URLs must 308 for bots. */
const FOREIGN_LOCALE = {
  'www.tutlio.com': { locale: 'lt', target: 'https://www.tutlio.lt/pricing' },
  'www.tutlio.lt': { locale: 'en', target: 'https://www.tutlio.com/pricing' },
  'www.tutlio.pl': { locale: 'en', target: 'https://www.tutlio.com/pricing' },
};

const origins = process.argv.slice(2).filter((a) => a.startsWith('http'));
const targets = origins.length ? origins : DEFAULTS;

let failures = 0;
const results = [];

async function get(url, ua, redirect = 'manual') {
  const headers = { 'User-Agent': ua };
  // Vercel middleware uses Fetch Metadata to distinguish a real browser
  // navigation from crawler-like HTTP clients whose UA may not be in a
  // static allowlist. Node's fetch does not add these headers by itself.
  if (ua === HUMAN) {
    headers['Sec-Fetch-Mode'] = 'navigate';
    headers['Sec-Fetch-Dest'] = 'document';
    headers['Sec-Fetch-Site'] = 'none';
    headers['Sec-Fetch-User'] = '?1';
  }
  const res = await fetch(url, { headers, redirect });
  const body = redirect === 'manual' && res.status >= 300 && res.status < 400 ? '' : await res.text();
  return { status: res.status, body, location: res.headers.get('location') || '' };
}

function check(name, ok, detail = '') {
  results.push(`${ok ? '  ✓' : '  ✗ FAIL'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures += 1;
}

async function checkDomain(origin) {
  const host = new URL(origin).host;
  results.push(`\n${origin}`);

  const robots = await get(`${origin}/robots.txt`, GOOGLEBOT);
  check('robots.txt 200 + Sitemap', robots.status === 200 && robots.body.includes(`Sitemap: ${origin}/sitemap.xml`), `status ${robots.status}`);

  const sitemap = await get(`${origin}/sitemap.xml`, GOOGLEBOT);
  check('sitemap.xml 200 + urlset', sitemap.status === 200 && sitemap.body.includes('<urlset'), `status ${sitemap.status}`);

  const botHome = await get(`${origin}/`, GOOGLEBOT);
  check(
    'home SSR for bots (200, canonical, no noindex)',
    botHome.status === 200 && botHome.body.includes('rel="canonical"') && !botHome.body.includes('noindex'),
    `status ${botHome.status}`,
  );

  const humanHome = await get(`${origin}/`, HUMAN);
  check('home SPA shell for humans (200 + noindex)', humanHome.status === 200 && humanHome.body.includes('noindex'), `status ${humanHome.status}`);

  const schools = await get(`${origin}/schools`, GOOGLEBOT);
  check('schools SSR for bots (200, indexable)', schools.status === 200 && schools.body.includes('rel="canonical"') && !schools.body.includes('noindex'), `status ${schools.status}`);

  // The solo landing and the competitor comparisons are separate indexable
  // pages; the homepage itself is the agency/school pitch.
  const forTutors = await get(`${origin}/for-tutors`, GOOGLEBOT);
  check(
    'for-tutors SSR for bots (200, self-canonical, indexable)',
    forTutors.status === 200 && forTutors.body.includes(`rel="canonical" href="${origin}/for-tutors"`) && !forTutors.body.includes('noindex'),
    `status ${forTutors.status}`,
  );

  const compare = await get(`${origin}/compare/tutorbird`, GOOGLEBOT);
  check(
    'compare/tutorbird SSR for bots (200, self-canonical, FAQ schema)',
    compare.status === 200 && compare.body.includes(`rel="canonical" href="${origin}/compare/tutorbird"`) && compare.body.includes('FAQPage') && !compare.body.includes('noindex'),
    `status ${compare.status}`,
  );

  const compareUnknown = await get(`${origin}/compare/not-a-vendor`, GOOGLEBOT);
  check('unknown comparison slug is a hard 404 for bots', compareUnknown.status === 404, `status ${compareUnknown.status}`);

  const missing = await get(`${origin}/this-page-never-existed-${Date.now()}`, GOOGLEBOT);
  check('unknown URL is a hard 404 for bots', missing.status === 404, `status ${missing.status}`);

  // Locale-prefixed unknown URLs may hop through canonicalization redirects
  // (default-locale strip / cross-domain) but must terminate in a hard 404.
  const missingDeep = await get(`${origin}/en/this-page-never-existed`, GOOGLEBOT, 'follow');
  check('unknown locale-prefixed URL ends in 404 for bots', missingDeep.status === 404, `status ${missingDeep.status}`);

  // Same-origin redirects may carry a relative Location header.
  const samePath = (location) => location.replace(origin, '');

  const defLocale = DEFAULT_LOCALE[host];
  const stripped = await get(`${origin}/${defLocale}/pricing`, GOOGLEBOT);
  check(
    `/${defLocale}/pricing 308 → /pricing (default-locale strip)`,
    stripped.status === 308 && samePath(stripped.location) === '/pricing',
    `status ${stripped.status} → ${stripped.location}`,
  );

  const foreign = FOREIGN_LOCALE[host];
  const cross = await get(`${origin}/${foreign.locale}/pricing`, GOOGLEBOT);
  check(
    `/${foreign.locale}/pricing 308 → canonical domain for bots`,
    cross.status === 308 && cross.location.startsWith(foreign.target),
    `status ${cross.status} → ${cross.location}`,
  );

  const humanCross = await get(`${origin}/${foreign.locale}/pricing`, HUMAN);
  check(
    `/${foreign.locale}/pricing stays 200 SPA for humans`,
    humanCross.status === 200 && humanCross.body.includes('noindex'),
    `status ${humanCross.status}`,
  );

  const slash = await get(`${origin}/pricing/`, GOOGLEBOT);
  check(
    'trailing slash 308 → clean URL',
    slash.status === 308 && samePath(slash.location) === '/pricing',
    `status ${slash.status} → ${slash.location}`,
  );

  const alias = await get(`${origin}${ALIAS_SLUG[host]}`, GOOGLEBOT);
  check(
    `alias ${ALIAS_SLUG[host]} 308 → ${CANONICAL_SLUG[host]}`,
    alias.status === 308 && alias.location.includes(CANONICAL_SLUG[host]),
    `status ${alias.status} → ${alias.location}`,
  );

  const feed = await get(`${origin}/blog/rss.xml`, HUMAN);
  check('blog RSS feed 200 + <rss', feed.status === 200 && feed.body.includes('<rss'), `status ${feed.status}`);

  const key = await get(`${origin}/${INDEXNOW_KEY}.txt`, HUMAN);
  check('IndexNow key file served', key.status === 200 && key.body.trim() === INDEXNOW_KEY, `status ${key.status}`);

  const llms = await get(`${origin}/llms.txt`, HUMAN);
  check('llms.txt 200', llms.status === 200 && llms.body.startsWith('# Tutlio'), `status ${llms.status}`);
}

/**
 * Every search-published locale on the international domain must get the
 * same crawler contract as English. Keep in sync with the .com entries of
 * SEO_LOCALES_BY_SURFACE.marketing in src/lib/i18n/localeRelease.ts
 * (tests/api/seo-locale-parity.test.ts checks the same matrix offline).
 */
const COM_LOCALES = { lv: 'lv', ee: 'et', fr: 'fr', es: 'es', de: 'de', se: 'sv', dk: 'da', fi: 'fi', no: 'no', nl: 'nl', it: 'it', pt: 'pt', ro: 'ro', cs: 'cs', el: 'el', hu: 'hu', bg: 'bg', hr: 'hr', sk: 'sk', sl: 'sl', hi: 'hi', ko: 'ko', ja: 'ja', id: 'id', ar: 'ar', 'pt-br': 'pt-BR', 'es-mx': 'es-MX', fil: 'fil', he: 'he', uk: 'uk', 'zh-hk': 'zh-HK', tr: 'tr', th: 'th' };

function meta(body, name) {
  const m = body.match(new RegExp(`<(?:meta name|meta property)="${name}" content="([^"]*)"`));
  return m ? m[1] : '';
}

async function checkComLocales(origin) {
  results.push(`\n${origin} — locale parity with English`);
  const enHome = await get(`${origin}/`, GOOGLEBOT);
  const enPricing = await get(`${origin}/pricing`, GOOGLEBOT);
  const enTitle = { home: (enHome.body.match(/<title>([^<]*)<\/title>/) || [])[1] || '', pricing: (enPricing.body.match(/<title>([^<]*)<\/title>/) || [])[1] || '' };
  for (const [slug, lang] of Object.entries(COM_LOCALES)) {
    for (const [page, path] of [['home', ''], ['pricing', '/pricing']]) {
      const url = `${origin}/${slug}${path}`;
      const r = await get(url, GOOGLEBOT);
      const title = (r.body.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
      const hreflangs = (r.body.match(/rel="alternate" hreflang="/g) || []).length;
      const ok =
        r.status === 200 &&
        r.body.includes(`<html lang="${lang}"`) &&
        r.body.includes(`<link rel="canonical" href="${url}" />`) &&
        meta(r.body, 'robots') === 'index, follow, max-image-preview:large' &&
        hreflangs >= 14 &&
        title.length > 12 &&
        title !== enTitle[page] &&
        meta(r.body, 'description').length > 30;
      check(
        `/${slug}${path} indexable, lang=${lang}, self-canonical, localized title, ${hreflangs} hreflang`,
        ok,
        `status ${r.status}, title "${title.slice(0, 60)}"`,
      );
    }
  }
}

for (const origin of targets) {
  try {
    await checkDomain(origin);
    if (new URL(origin).host === 'www.tutlio.com') await checkComLocales(origin);
  } catch (e) {
    failures += 1;
    results.push(`  ✗ FAIL ${origin} — ${e.message}`);
  }
}

console.log(results.join('\n'));
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll SEO smoke checks passed');
process.exit(failures ? 1 : 0);
