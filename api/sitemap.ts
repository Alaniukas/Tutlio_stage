import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import {
  type Locale,
  LOCALES,
  detectDomain,
  buildCanonicalUrl,
  buildFullUrl,
  canonicalDomain,
} from './_lib/seo-routing.js';

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) as any;
}

const STATIC_PAGES: { path: string; changefreq: string; priority: string }[] = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/pricing', changefreq: 'monthly', priority: '0.8' },
  { path: '/apie-mus', changefreq: 'monthly', priority: '0.7' },
  { path: '/kontaktai', changefreq: 'monthly', priority: '0.6' },
  { path: '/features/calendar', changefreq: 'monthly', priority: '0.7' },
  { path: '/features/waitlist', changefreq: 'monthly', priority: '0.7' },
  { path: '/features/payments', changefreq: 'monthly', priority: '0.7' },
  { path: '/features/reminders', changefreq: 'monthly', priority: '0.7' },
  { path: '/features/cancellation', changefreq: 'monthly', priority: '0.7' },
  { path: '/features/comments', changefreq: 'monthly', priority: '0.7' },
  { path: '/privacy-policy', changefreq: 'yearly', priority: '0.3' },
  { path: '/terms', changefreq: 'yearly', priority: '0.3' },
  { path: '/dpa', changefreq: 'yearly', priority: '0.2' },
];

const TITLE_COLUMNS = LOCALES.map((l) => `title_${l}`).join(', ');
const SLUG_COLUMNS = LOCALES.map((l) => `slug_${l}`).join(', ');

function postHasTranslation(post: Record<string, unknown>, locale: Locale): boolean {
  return !!post[`title_${locale}`];
}

function postSlug(post: Record<string, unknown>, locale: Locale): string {
  return (post[`slug_${locale}`] as string) || (post.slug as string);
}

function alternatesXml(path: string, locales: Locale[] = LOCALES): string {
  const links: string[] = [];

  for (const locale of locales) {
    const href = buildCanonicalUrl(path, locale);
    links.push(`    <xhtml:link rel="alternate" hreflang="${locale}" href="${href}" />`);
  }

  const xDefault = buildFullUrl(path, 'en', 'com');
  links.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${xDefault}" />`);
  return links.join('\n');
}

function blogPostAlternatesXml(post: Record<string, unknown>, locales: Locale[]): string {
  const links: string[] = [];
  for (const locale of locales) {
    const slug = postSlug(post, locale);
    const href = buildCanonicalUrl(`/blog/${slug}`, locale);
    links.push(`    <xhtml:link rel="alternate" hreflang="${locale}" href="${href}" />`);
  }
  const enSlug = postSlug(post, 'en');
  const xDefault = buildFullUrl(`/blog/${enSlug}`, 'en', 'com');
  links.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${xDefault}" />`);
  return links.join('\n');
}

function urlEntry(loc: string, changefreq: string, priority: string, path: string, altLocales: Locale[], lastmod?: string): string {
  return `  <url>
    <loc>${loc}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
${alternatesXml(path, altLocales)}
  </url>`;
}

function blogPostUrlEntry(loc: string, changefreq: string, priority: string, post: Record<string, unknown>, altLocales: Locale[], lastmod?: string): string {
  return `  <url>
    <loc>${loc}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
${blogPostAlternatesXml(post, altLocales)}
  </url>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const domain = detectDomain(req);
  const supabase = getSupabase();

  let blogPosts: Record<string, unknown>[] = [];
  if (supabase) {
    const { data } = await supabase
      .from('blog_posts')
      .select(`slug, ${SLUG_COLUMNS}, published_at, ${TITLE_COLUMNS}`)
      .eq('status', 'published')
      .order('published_at', { ascending: false });
    blogPosts = data || [];
  }

  const entries: string[] = [];
  const myLocales = LOCALES.filter((l) => canonicalDomain(l) === domain);

  for (const page of STATIC_PAGES) {
    for (const locale of myLocales) {
      const loc = buildCanonicalUrl(page.path, locale);
      entries.push(urlEntry(loc, page.changefreq, page.priority, page.path, LOCALES));
    }
  }

  // Only include blog URLs for locales that have at least one translated post
  const blogTranslatedLocales = myLocales.filter(
    (l) => blogPosts.some((p) => postHasTranslation(p, l)),
  );

  if (blogTranslatedLocales.length > 0) {
    for (const locale of blogTranslatedLocales) {
      const loc = buildCanonicalUrl('/blog', locale);
      entries.push(urlEntry(loc, 'weekly', '0.8', '/blog', blogTranslatedLocales));
    }
  }

  const today = new Date().toISOString().split('T')[0];
  for (const post of blogPosts) {
    const lastmod = post.published_at ? (post.published_at as string).split('T')[0] : today;

    const postLocales = myLocales.filter((l) => postHasTranslation(post, l));
    for (const locale of postLocales) {
      const slug = postSlug(post, locale);
      const loc = buildCanonicalUrl(`/blog/${slug}`, locale);
      entries.push(blogPostUrlEntry(loc, 'monthly', '0.7', post, postLocales, lastmod));
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join('\n')}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).send(xml);
}
