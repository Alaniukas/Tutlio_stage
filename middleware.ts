import { next, rewrite } from '@vercel/functions';

// Kept dependency-free for the edge runtime; sync with api/_lib/seo-routing.ts
// and src/lib/featurePages.ts is enforced by tests/lib/seo-visibility.test.ts.
export const LOCALES = new Set(['en', 'lt', 'pl', 'lv', 'ee', 'fr', 'es', 'de', 'se', 'dk', 'fi', 'no']);
export const FEATURES = new Set(['calendar', 'waitlist', 'payments', 'reminders', 'cancellation', 'comments']);

/** Crawlers and AI fetchers — humans always get the Vite SPA. */
export const BOT_UA =
  /googlebot|google-inspectiontool|bingbot|slurp|duckduckbot|duckassist|baiduspider|yandexbot|applebot|facebookexternalhit|facebookbot|meta-external|twitterbot|linkedinbot|embedly|slackbot|discordbot|whatsapp|telegrambot|semrush|ahrefs|mj12bot|dotbot|petalbot|bytespider|gptbot|chatgpt-user|oai-searchbot|claudebot|claude-web|anthropic-ai|perplexity|cohere|amazonbot|ccbot|mistral|youbot|kagibot|diffbot/i;

function isBot(request: Request): boolean {
  const ua = request.headers.get('user-agent') || '';
  return BOT_UA.test(ua);
}

export function defaultLocale(host: string): string {
  if (host.includes('tutlio.com')) return 'en';
  if (host.includes('tutlio.pl')) return 'pl';
  return 'lt';
}

function parsePath(pathname: string): { locale: string; rest: string } {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length > 0 && LOCALES.has(segments[0])) {
    const locale = segments[0];
    const rest = segments.length > 1 ? `/${segments.slice(1).join('/')}` : '/';
    return { locale, rest };
  }
  return { locale: '', rest: pathname || '/' };
}

/**
 * App/auth surfaces that stay SPA-only. Bots fall through to the shell
 * (200 + noindex) instead of the 404 fallback so shared-link previews keep
 * working; Googlebot never crawls these — they are disallowed in robots.txt.
 */
export const APP_ROUTES = new Set([
  'login', 'register', 'reset-password', 'auth', 'dashboard', 'calendar',
  'students', 'waitlist', 'messages', 'finance', 'invoices', 'instructions',
  'lesson-settings', 'settings', 'admin', 'student', 'parent', 'company',
  'school', 'parent-register', 'tutor-subscribe', 'registration', 'book',
  'school-contract-complete', 'stripe-success', 'perlas-success',
  'package-success', 'package-cancelled', 'school-payment-success',
  'enterprise', 'whiteboard',
]);

function isExcludedPath(pathname: string): boolean {
  // File-like paths (robots.txt, sitemap.xml, llms.txt, favicons…) are
  // handled by vercel.json rewrites / static serving, never by SSR.
  if (pathname.includes('.')) return true;
  if (pathname.startsWith('/api/') || pathname.startsWith('/assets/')) return true;
  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0] || '';
  if (APP_ROUTES.has(first)) return true;
  // Locale- or platform-prefixed app routes (/en/login, /schools/register…).
  if (segments.length > 1 && (LOCALES.has(first) || first === 'schools' || first === 'teachers')) {
    if (APP_ROUTES.has(segments[1])) return true;
  }
  return false;
}

const ABOUT_SLUGS = new Set(['apie-mus', 'about']);
const CONTACT_SLUGS = new Set(['kontaktai', 'contacts']);

const PLATFORM_PREFIXES = new Set(['schools', 'teachers']);

const CANONICAL_ORIGINS: Record<string, string> = {
  lt: 'https://www.tutlio.lt',
  pl: 'https://www.tutlio.pl',
  com: 'https://www.tutlio.com',
};

function canonicalOriginForLocale(locale: string): string {
  if (locale === 'lt') return CANONICAL_ORIGINS.lt;
  if (locale === 'pl') return CANONICAL_ORIGINS.pl;
  return CANONICAL_ORIGINS.com;
}

function originForHost(host: string): string | null {
  if (host.includes('tutlio.lt')) return CANONICAL_ORIGINS.lt;
  if (host.includes('tutlio.pl')) return CANONICAL_ORIGINS.pl;
  if (host.includes('tutlio.com')) return CANONICAL_ORIGINS.com;
  return null; // vercel.app previews and unknown hosts stay untouched
}

/**
 * The default locale never carries a URL prefix (/en/pricing on .com is a
 * duplicate of /pricing), so the prefixed alias 308s to the bare path for
 * every visitor. Platform-prefixed paths nest the locale one segment deeper
 * (/schools/en/pricing → /schools/pricing).
 */
export function defaultLocaleStripRedirect(pathname: string, host: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  const localeIdx = PLATFORM_PREFIXES.has(segments[0] || '') ? 1 : 0;
  const seg = segments[localeIdx];
  if (!seg || !LOCALES.has(seg) || seg !== defaultLocale(host)) return null;
  const rest = segments.filter((_, i) => i !== localeIdx).join('/');
  return rest ? `/${rest}` : '/';
}

/**
 * Same-domain canonical form of a pathname, collapsed into a single hop:
 * no trailing slash (bots previously hard-404ed on /pricing/), no
 * default-locale prefix, canonical about/contact slug. Null when the path
 * is already canonical. Also enforced by vercel.json "trailingSlash": false,
 * but handled here too so the contract holds regardless of whether platform
 * normalization runs before or after middleware.
 */
export function sameDomainCanonicalPath(pathname: string, host: string): string | null {
  const noSlash =
    pathname.length > 1 && pathname.endsWith('/') ? pathname.replace(/\/+$/, '') || '/' : null;
  const base = noSlash || pathname;
  const stripped = defaultLocaleStripRedirect(base, host);
  const withSlug = canonicalSlugRedirect(stripped || base, host);
  return withSlug || stripped || noSlash;
}

/**
 * Bots only: a locale whose canonical home is another Tutlio domain 308s
 * there (tutlio.com/lt/pricing → tutlio.lt/pricing) instead of serving
 * duplicate content with a cross-domain canonical hint — Search Console
 * shows Google overriding some of those hints ("Google chose different
 * canonical than user"), and a redirect is the strongest canonical signal.
 * Humans stay on-domain: the SPA language switcher navigates same-domain
 * and sessions don't span domains.
 */
export function crossDomainLocaleRedirect(pathname: string, host: string): string | null {
  const origin = originForHost(host);
  if (!origin) return null;
  const segments = pathname.split('/').filter(Boolean);
  const platform = PLATFORM_PREFIXES.has(segments[0] || '') ? segments[0] : '';
  const localeIdx = platform ? 1 : 0;
  const locale = segments[localeIdx];
  if (!locale || !LOCALES.has(locale)) return null;
  const targetOrigin = canonicalOriginForLocale(locale);
  if (targetOrigin === origin) return null;
  const targetHost = targetOrigin.replace('https://', '');
  const keepLocale = locale !== defaultLocale(targetHost);
  const parts = [platform, keepLocale ? locale : '', ...segments.slice(localeIdx + 1)].filter(Boolean);
  return `${targetOrigin}${parts.length ? `/${parts.join('/')}` : '/'}`;
}

/**
 * The about/contact pages have Lithuanian and English slugs. The Lithuanian
 * slug is canonical for the lt locale, the English one everywhere else —
 * mirrors localizedPagePath() in api/_lib/seo-routing.ts. Requests for the
 * non-canonical alias 308 to the canonical slug (same host, same locale).
 */
export function canonicalSlugRedirect(pathname: string, host: string): string | null {
  const segments = pathname.split('/').filter(Boolean);
  let localeSeg = '';
  let rest = segments;
  if (segments.length > 0 && LOCALES.has(segments[0])) {
    localeSeg = segments[0];
    rest = segments.slice(1);
  }
  if (rest.length !== 1) return null;

  const slug = rest[0];
  const locale = localeSeg || defaultLocale(host);
  const isLt = locale === 'lt';

  let canonical: string | null = null;
  if (ABOUT_SLUGS.has(slug)) canonical = isLt ? 'apie-mus' : 'about';
  else if (CONTACT_SLUGS.has(slug)) canonical = isLt ? 'kontaktai' : 'contacts';

  if (!canonical || canonical === slug) return null;
  return localeSeg ? `/${localeSeg}/${canonical}` : `/${canonical}`;
}

export function ssrDestination(request: Request): string | null {
  const url = new URL(request.url);
  const { pathname } = url;
  const host = request.headers.get('host') || '';

  // Schools marketing pages (and the /teachers alias, which canonicalizes to
  // /schools inside the renderer). Locale nests after the platform prefix.
  const platformMatch = pathname.match(/^\/(schools|teachers)(\/.*)?$/);
  if (platformMatch) {
    const sub = platformMatch[2] || '/';
    const { locale: localeSeg, rest } = parsePath(sub);
    const locale = localeSeg || defaultLocale(host);
    if (rest === '/' || rest === '') {
      return `/api/schools-render?page=landing&locale=${locale}`;
    }
    if (rest === '/pricing') {
      return `/api/schools-render?page=pricing&locale=${locale}`;
    }
    return null;
  }

  const { locale: localeSeg, rest } = parsePath(pathname);
  const locale = localeSeg || defaultLocale(host);

  if (rest === '/' || rest === '') {
    return `/api/page-render?page=landing&locale=${locale}`;
  }

  if (rest === '/pricing') {
    return `/api/page-render?page=pricing&locale=${locale}`;
  }

  if (rest === '/apie-mus' || rest === '/about') {
    return `/api/page-render?page=about&locale=${locale}`;
  }

  if (rest === '/kontaktai' || rest === '/contacts') {
    return `/api/page-render?page=contacts&locale=${locale}`;
  }

  const blogPost = rest.match(/^\/blog\/([^/]+)$/);
  if (blogPost) {
    return `/api/blog-render?slug=${encodeURIComponent(blogPost[1])}&locale=${locale}`;
  }

  if (rest === '/blog') {
    return `/api/blog-render?locale=${locale}`;
  }

  const feature = rest.match(/^\/features\/([^/]+)$/);
  if (feature && FEATURES.has(feature[1])) {
    return `/api/feature-render?feature=${encodeURIComponent(feature[1])}&locale=${locale}`;
  }

  if (rest === '/dpa') {
    return `/api/legal-render?page=dpa&locale=${locale}`;
  }
  if (rest === '/privacy-policy') {
    return `/api/legal-render?page=privacy-policy&locale=${locale}`;
  }
  if (rest === '/terms') {
    return `/api/legal-render?page=terms&locale=${locale}`;
  }

  return null;
}

export default function middleware(request: Request) {
  const url = new URL(request.url);
  const host = request.headers.get('host') || '';

  // Same-domain URL canonicalization for everyone, collapsed into one hop:
  // trailing slash, default-locale prefix, localized slug aliases.
  const canonicalPath = sameDomainCanonicalPath(url.pathname, host);
  if (canonicalPath) {
    return Response.redirect(new URL(`${canonicalPath}${url.search}`, request.url), 308);
  }

  if (!isBot(request)) {
    return next();
  }

  if (isExcludedPath(url.pathname)) {
    return next();
  }

  const crossDomainTarget = crossDomainLocaleRedirect(url.pathname, host);
  if (crossDomainTarget) {
    return Response.redirect(`${crossDomainTarget}${url.search}`, 308);
  }

  const dest = ssrDestination(request);
  if (!dest) {
    // Unknown URL: serve a real 404 instead of the 200 + noindex SPA shell
    // so crawlers don't accumulate soft 404s.
    return rewrite(new URL('/api/not-found', request.url));
  }

  return rewrite(new URL(dest, request.url));
}

export const config = {
  // Catch-all over every dot-free path (assets/files contain dots, /api is
  // excluded). Routing happens in code: known pages SSR for bots, app routes
  // fall through to the SPA shell, and anything else 404s — an enumerated
  // matcher would leave unknown paths (e.g. /en/removed-page) as soft 404s.
  matcher: ['/', '/((?!api/|assets/)(?!.*\\.).*)'],
};
