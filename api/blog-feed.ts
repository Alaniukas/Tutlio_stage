import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import {
  type Locale,
  LOCALES,
  detectDomain,
  getDefaultLocale,
  buildCanonicalUrl,
  hreflangCode,
  esc,
} from './_lib/seo-routing.js';
import { t } from './_lib/i18n.js';

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function postSlug(post: Record<string, unknown>, locale: Locale): string {
  return (post[`slug_${locale}`] as string) || (post.slug as string);
}

function resolveField(post: Record<string, unknown>, field: string, locale: Locale): string {
  return (post[`${field}_${locale}`] as string) || '';
}

function rfc822(date: string): string {
  return new Date(date).toUTCString();
}

export const FEED_POST_LIMIT = 50;

/**
 * RSS 2.0 feed of published blog posts, one feed per locale. Feeds give
 * Google/Bing a push-style discovery channel for new content and are a
 * common ingestion source for AI/LLM crawlers.
 *
 * /blog/rss.xml          → feed in the domain's default locale
 * /blog/rss.xml?locale=x → feed in any supported locale (canonical URLs)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).send('Method Not Allowed');
  }

  const domain = detectDomain(req);
  const requested = typeof req.query.locale === 'string' ? req.query.locale : '';
  const locale: Locale = (LOCALES as readonly string[]).includes(requested)
    ? (requested as Locale)
    : getDefaultLocale(domain);

  let posts: Record<string, unknown>[] = [];
  const supabase = getSupabase();
  if (supabase) {
    const { data } = await supabase
      .from('blog_posts')
      .select('*')
      .eq('status', 'published')
      .not(`title_${locale}`, 'is', null)
      .order('published_at', { ascending: false })
      .limit(FEED_POST_LIMIT);
    posts = data || [];
  }

  const channelLink = buildCanonicalUrl('/blog', locale);
  const selfUrl = `${buildCanonicalUrl('/blog/rss.xml', locale).replace(/\/$/, '')}`;

  const items = posts
    .map((post) => {
      const title = resolveField(post, 'title', locale);
      if (!title) return '';
      const link = buildCanonicalUrl(`/blog/${postSlug(post, locale)}`, locale);
      const excerpt = resolveField(post, 'excerpt', locale);
      const published = (post.published_at as string) || '';
      return `    <item>
      <title>${esc(title)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="true">${esc(link)}</guid>${published ? `\n      <pubDate>${rfc822(published)}</pubDate>` : ''}${excerpt ? `\n      <description>${esc(excerpt)}</description>` : ''}
    </item>`;
    })
    .filter(Boolean);

  const lastBuild = posts.length
    ? rfc822((posts[0].updated_at as string) || (posts[0].published_at as string) || new Date().toISOString())
    : new Date().toUTCString();

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Tutlio Blog</title>
    <link>${esc(channelLink)}</link>
    <atom:link href="${esc(selfUrl)}" rel="self" type="application/rss+xml" />
    <description>${esc(t(locale, 'blog.subtitle'))}</description>
    <language>${hreflangCode(locale)}</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
${items.join('\n')}
  </channel>
</rss>`;

  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).send(xml);
}
