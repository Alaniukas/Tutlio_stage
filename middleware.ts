import { next, rewrite } from '@vercel/functions';

const LOCALES = new Set(['en', 'lt', 'pl', 'lv', 'ee', 'fr', 'es', 'de', 'se', 'dk', 'fi', 'no']);
const FEATURES = new Set(['calendar', 'waitlist', 'payments', 'reminders']);

/** Crawlers and AI fetchers — humans always get the Vite SPA. */
const BOT_UA =
  /googlebot|google-inspectiontool|bingbot|slurp|duckduckbot|baiduspider|yandexbot|applebot|facebookexternalhit|twitterbot|linkedinbot|embedly|slackbot|discordbot|whatsapp|telegrambot|semrush|ahrefs|mj12bot|dotbot|petalbot|bytespider|gptbot|chatgpt-user|claudebot|anthropic-ai|perplexity|cohere-ai|amazonbot/i;

function isBot(request: Request): boolean {
  const ua = request.headers.get('user-agent') || '';
  return BOT_UA.test(ua);
}

function defaultLocale(host: string): string {
  return host.includes('tutlio.com') ? 'en' : 'lt';
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

function ssrDestination(request: Request): string | null {
  const url = new URL(request.url);
  const { pathname } = url;
  const host = request.headers.get('host') || '';

  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/schools/') ||
    pathname.startsWith('/teachers/') ||
    pathname.startsWith('/school/') ||
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/register')
  ) {
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
  if (!isBot(request)) {
    return next();
  }

  const dest = ssrDestination(request);
  if (!dest) {
    return next();
  }

  return rewrite(new URL(dest, request.url));
}

export const config = {
  matcher: [
    '/',
    '/pricing',
    '/apie-mus',
    '/kontaktai',
    '/about',
    '/contacts',
    '/blog',
    '/blog/:slug*',
    '/features/:feature*',
    '/dpa',
    '/privacy-policy',
    '/terms',
    '/:locale',
    '/:locale/pricing',
    '/:locale/apie-mus',
    '/:locale/kontaktai',
    '/:locale/about',
    '/:locale/contacts',
    '/:locale/blog',
    '/:locale/blog/:slug*',
    '/:locale/features/:feature*',
    '/:locale/dpa',
    '/:locale/privacy-policy',
    '/:locale/terms',
  ],
};
