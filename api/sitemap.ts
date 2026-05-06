import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import {
  type Locale,
  type DomainKey,
  LOCALES,
  detectDomain,
  buildFullUrl,
} from './_lib/ssr-shell';

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
  { path: '/blog', changefreq: 'weekly', priority: '0.8' },
  { path: '/privacy-policy', changefreq: 'yearly', priority: '0.3' },
  { path: '/terms', changefreq: 'yearly', priority: '0.3' },
  { path: '/dpa', changefreq: 'yearly', priority: '0.2' },
];

function alternatesXml(path: string): string {
  const links: string[] = [];
  const seen = new Set<string>();

  for (const locale of LOCALES) {
    for (const domain of ['lt', 'com'] as DomainKey[]) {
      const href = buildFullUrl(path, locale, domain);
      const key = `${locale}:${href}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push(`    <xhtml:link rel="alternate" hreflang="${locale}" href="${href}" />`);
    }
  }

  const xDefault = buildFullUrl(path, 'en', 'com');
  links.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${xDefault}" />`);
  return links.join('\n');
}

function urlEntry(loc: string, changefreq: string, priority: string, path: string, lastmod?: string): string {
  return `  <url>
    <loc>${loc}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
${alternatesXml(path)}
  </url>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const domain = detectDomain(req);
  const supabase = getSupabase();

  let blogPosts: { slug: string; published_at: string }[] = [];
  if (supabase) {
    const { data } = await supabase
      .from('blog_posts')
      .select('slug, published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false });
    blogPosts = data || [];
  }

  const entries: string[] = [];
  const today = new Date().toISOString().split('T')[0];

  for (const page of STATIC_PAGES) {
    for (const locale of LOCALES) {
      const loc = buildFullUrl(page.path, locale, domain);
      entries.push(urlEntry(loc, page.changefreq, page.priority, page.path, today));
    }
  }

  for (const post of blogPosts) {
    const blogPath = `/blog/${post.slug}`;
    const lastmod = post.published_at ? post.published_at.split('T')[0] : today;
    for (const locale of LOCALES) {
      const loc = buildFullUrl(blogPath, locale, domain);
      entries.push(urlEntry(loc, 'monthly', '0.7', blogPath, lastmod));
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
