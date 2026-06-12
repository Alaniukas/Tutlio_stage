#!/usr/bin/env node
/**
 * Production SEO smoke check — verifies the crawler-facing contract on the
 * live domains after every deploy (SSR for bots, noindex SPA for humans,
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

const origins = process.argv.slice(2).filter((a) => a.startsWith('http'));
const targets = origins.length ? origins : DEFAULTS;

let failures = 0;
const results = [];

async function get(url, ua, redirect = 'manual') {
  const res = await fetch(url, { headers: { 'User-Agent': ua }, redirect });
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

  const missing = await get(`${origin}/this-page-never-existed-${Date.now()}`, GOOGLEBOT);
  check('unknown URL is a hard 404 for bots', missing.status === 404, `status ${missing.status}`);

  const missingDeep = await get(`${origin}/en/this-page-never-existed`, GOOGLEBOT);
  check('unknown locale-prefixed URL is 404 for bots', missingDeep.status === 404, `status ${missingDeep.status}`);

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

for (const origin of targets) {
  try {
    await checkDomain(origin);
  } catch (e) {
    failures += 1;
    results.push(`  ✗ FAIL ${origin} — ${e.message}`);
  }
}

console.log(results.join('\n'));
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll SEO smoke checks passed');
process.exit(failures ? 1 : 0);
