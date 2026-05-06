import type { VercelRequest, VercelResponse } from './types';
import { detectDomain } from './_lib/ssr-shell';

export default function handler(req: VercelRequest, res: VercelResponse) {
  const domain = detectDomain(req);
  const sitemapUrl =
    domain === 'com'
      ? 'https://www.tutlio.com/sitemap.xml'
      : 'https://www.tutlio.lt/sitemap.xml';

  const body = `User-agent: *
Allow: /
Allow: /apie-mus
Allow: /kontaktai
Allow: /pricing
Allow: /privacy-policy
Allow: /terms
Allow: /dpa
Allow: /blog
Allow: /blog/

Disallow: /login
Disallow: /register
Disallow: /reset-password
Disallow: /auth/
Disallow: /dashboard
Disallow: /calendar
Disallow: /students
Disallow: /waitlist
Disallow: /messages
Disallow: /finance
Disallow: /invoices
Disallow: /instructions
Disallow: /lesson-settings
Disallow: /settings
Disallow: /student/
Disallow: /parent/
Disallow: /parent-register
Disallow: /company/
Disallow: /school/
Disallow: /admin
Disallow: /book/
Disallow: /registration/
Disallow: /tutor-subscribe
Disallow: /stripe-success
Disallow: /package-success
Disallow: /package-cancelled
Disallow: /school-payment-success
Disallow: /api/

Sitemap: ${sitemapUrl}
`;

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=86400');
  return res.status(200).send(body);
}
