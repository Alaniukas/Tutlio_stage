import type { VercelRequest, VercelResponse } from './types';
import { detectDomain } from './_lib/seo-routing.js';

const SITEMAP_URLS = {
  lt: 'https://www.tutlio.lt/sitemap.xml',
  com: 'https://www.tutlio.com/sitemap.xml',
  pl: 'https://www.tutlio.pl/sitemap.xml',
} as const;

const ALLOW_PATHS = [
  '/',
  '/apie-mus',
  '/about',
  '/kontaktai',
  '/contacts',
  '/pricing',
  '/privacy-policy',
  '/terms',
  '/dpa',
  '/blog',
  '/blog/',
  '/features/',
  '/schools',
  '/schools/',
  '/teachers',
  '/teachers/',
  '/llms.txt',
  '/llms-full.txt',
];

/** App/auth surfaces — kept in sync with APP_ROUTES in middleware.ts (tested). */
export const DISALLOW_PATHS = [
  '/login',
  '/register',
  '/reset-password',
  '/auth/',
  '/dashboard',
  '/calendar',
  '/students',
  '/waitlist',
  '/messages',
  '/finance',
  '/invoices',
  '/instructions',
  '/lesson-settings',
  '/settings',
  '/student/',
  '/parent/',
  '/parent-register',
  '/company/',
  '/school/',
  '/admin',
  '/book/',
  '/registration/',
  '/tutor-subscribe',
  '/stripe-success',
  '/perlas-success',
  '/school-contract-complete',
  '/package-success',
  '/package-cancelled',
  '/school-payment-success',
  '/enterprise/',
  '/whiteboard/',
  '/api/',
];

export default function handler(req: VercelRequest, res: VercelResponse) {
  const domain = detectDomain(req);
  const sitemapUrl = SITEMAP_URLS[domain];

  const body = `User-agent: *
${ALLOW_PATHS.map((p) => `Allow: ${p}`).join('\n')}

${DISALLOW_PATHS.map((p) => `Disallow: ${p}`).join('\n')}

Sitemap: ${sitemapUrl}
`;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
  return res.status(200).send(body);
}
