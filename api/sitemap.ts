import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';

const DOMAIN = 'https://www.tutlio.lt';

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) as any;
}

const STATIC_PAGES = [
  { path: '/', changefreq: 'weekly', priority: '1.0', locales: ['lt', 'en'] },
  { path: '/apie-mus', changefreq: 'monthly', priority: '0.7', locales: ['lt', 'en'] },
  { path: '/kontaktai', changefreq: 'monthly', priority: '0.6', locales: ['lt', 'en'] },
  { path: '/pricing', changefreq: 'monthly', priority: '0.8', locales: ['lt', 'en'] },
  { path: '/blog', changefreq: 'weekly', priority: '0.8', locales: ['lt', 'en'] },
  { path: '/privacy-policy', changefreq: 'yearly', priority: '0.3', locales: [] },
  { path: '/terms', changefreq: 'yearly', priority: '0.3', locales: [] },
  { path: '/dpa', changefreq: 'yearly', priority: '0.2', locales: [] },
];

function urlEntry(loc: string, changefreq: string, priority: string, alternates?: { lang: string; href: string }[]): string {
  const alt = (alternates || []).map(a => `    <xhtml:link rel="alternate" hreflang="${a.lang}" href="${a.href}" />`).join('\n');
  return `  <url>
    <loc>${loc}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
${alt}
  </url>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabase = getSupabase();

  let blogSlugs: string[] = [];
  if (supabase) {
    const { data } = await supabase
      .from('blog_posts')
      .select('slug')
      .eq('status', 'published')
      .order('published_at', { ascending: false });
    blogSlugs = (data || []).map((p: { slug: string }) => p.slug);
  }

  const entries: string[] = [];

  for (const page of STATIC_PAGES) {
    const loc = page.path === '/' ? DOMAIN + '/' : `${DOMAIN}${page.path}`;
    const alternates = page.locales.length > 0
      ? page.locales.map(lang => ({
          lang,
          href: lang === 'lt' ? loc : `${DOMAIN}/${lang}${page.path === '/' ? '' : page.path}`,
        }))
      : undefined;
    entries.push(urlEntry(loc, page.changefreq, page.priority, alternates));
  }

  for (const slug of blogSlugs) {
    const loc = `${DOMAIN}/blog/${slug}`;
    entries.push(urlEntry(loc, 'monthly', '0.7', [
      { lang: 'lt', href: loc },
      { lang: 'en', href: `${DOMAIN}/en/blog/${slug}` },
    ]));
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
