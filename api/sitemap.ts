import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import {
  type Locale,
  LOCALES,
  detectDomain,
  buildCanonicalUrl,
  buildPlatformCanonicalUrl,
  localizedPagePath,
  canonicalDomain,
  hreflangCode,
} from './_lib/seo-routing.js';

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) as any;
}

/** Bump when marketing copy meaningfully changes — emitted as <lastmod>. */
const STATIC_LASTMOD = '2026-06-12';

interface SitemapPage {
  urlFor: (locale: Locale) => string;
  changefreq: string;
  priority: string;
}

function plainPage(path: string, changefreq: string, priority: string): SitemapPage {
  return { urlFor: (locale) => buildCanonicalUrl(path, locale), changefreq, priority };
}

export const STATIC_PAGES: SitemapPage[] = [
  plainPage('/', 'weekly', '1.0'),
  plainPage('/pricing', 'monthly', '0.8'),
  { urlFor: (l) => buildCanonicalUrl(localizedPagePath('about', l), l), changefreq: 'monthly', priority: '0.7' },
  { urlFor: (l) => buildCanonicalUrl(localizedPagePath('contacts', l), l), changefreq: 'monthly', priority: '0.6' },
  { urlFor: (l) => buildPlatformCanonicalUrl('/schools', '/', l), changefreq: 'weekly', priority: '0.8' },
  { urlFor: (l) => buildPlatformCanonicalUrl('/schools', '/pricing', l), changefreq: 'monthly', priority: '0.7' },
  plainPage('/features', 'monthly', '0.85'),
  plainPage('/features/calendar', 'monthly', '0.7'),
  plainPage('/features/waitlist', 'monthly', '0.7'),
  plainPage('/features/payments', 'monthly', '0.7'),
  plainPage('/features/reminders', 'monthly', '0.7'),
  plainPage('/features/cancellation', 'monthly', '0.7'),
  plainPage('/features/comments', 'monthly', '0.7'),
  plainPage('/privacy-policy', 'yearly', '0.3'),
  plainPage('/terms', 'yearly', '0.3'),
  plainPage('/dpa', 'yearly', '0.2'),
];

const TITLE_COLUMNS = LOCALES.map((l) => `title_${l}`).join(', ');
const SLUG_COLUMNS = LOCALES.map((l) => `slug_${l}`).join(', ');

function postHasTranslation(post: Record<string, unknown>, locale: Locale): boolean {
  return !!post[`title_${locale}`];
}

function postSlug(post: Record<string, unknown>, locale: Locale): string {
  return (post[`slug_${locale}`] as string) || (post.slug as string);
}

function postLastmod(post: Record<string, unknown>): string | undefined {
  const raw = (post.updated_at as string) || (post.published_at as string) || '';
  return raw ? raw.split('T')[0] : undefined;
}

/**
 * hreflang alternates for one URL. Spans every locale with content —
 * including locales canonical on the other Tutlio domains — so the
 * cross-domain hreflang cluster stays reciprocal in all three sitemaps.
 */
export function alternatesXmlFor(
  urlFor: (locale: Locale) => string,
  locales: Locale[] = LOCALES,
  includeXDefault = true,
): string {
  const links = locales.map(
    (locale) => `    <xhtml:link rel="alternate" hreflang="${hreflangCode(locale)}" href="${urlFor(locale)}" />`,
  );
  if (includeXDefault) {
    links.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${urlFor('en')}" />`);
  }
  return links.join('\n');
}

function urlEntry(
  loc: string,
  changefreq: string,
  priority: string,
  alternates: string,
  lastmod?: string,
): string {
  return `  <url>
    <loc>${loc}</loc>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
${alternates}
  </url>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const domain = detectDomain(req);
  const supabase = getSupabase();

  let blogPosts: Record<string, unknown>[] = [];
  if (supabase) {
    const { data } = await supabase
      .from('blog_posts')
      .select(`slug, ${SLUG_COLUMNS}, published_at, updated_at, ${TITLE_COLUMNS}`)
      .eq('status', 'published')
      .order('published_at', { ascending: false });
    blogPosts = data || [];
  }

  const entries: string[] = [];
  const myLocales = LOCALES.filter((l) => canonicalDomain(l) === domain);

  for (const page of STATIC_PAGES) {
    for (const locale of myLocales) {
      entries.push(
        urlEntry(page.urlFor(locale), page.changefreq, page.priority, alternatesXmlFor(page.urlFor), STATIC_LASTMOD),
      );
    }
  }

  // Blog listing: <loc> for this domain's translated locales, alternates
  // across every translated locale on any domain.
  const blogUrlFor = (l: Locale) => buildCanonicalUrl('/blog', l);
  const myBlogLocales = myLocales.filter((l) => blogPosts.some((p) => postHasTranslation(p, l)));
  const allBlogLocales = LOCALES.filter((l) => blogPosts.some((p) => postHasTranslation(p, l)));
  const latestPostLastmod = blogPosts.map(postLastmod).filter(Boolean).sort().pop();

  for (const locale of myBlogLocales) {
    entries.push(
      urlEntry(
        blogUrlFor(locale),
        'weekly',
        '0.8',
        alternatesXmlFor(blogUrlFor, allBlogLocales, allBlogLocales.includes('en')),
        latestPostLastmod,
      ),
    );
  }

  for (const post of blogPosts) {
    const postUrlFor = (l: Locale) => buildCanonicalUrl(`/blog/${postSlug(post, l)}`, l);
    const myPostLocales = myLocales.filter((l) => postHasTranslation(post, l));
    const allPostLocales = LOCALES.filter((l) => postHasTranslation(post, l));
    const lastmod = postLastmod(post);

    for (const locale of myPostLocales) {
      entries.push(
        urlEntry(
          postUrlFor(locale),
          'monthly',
          '0.7',
          alternatesXmlFor(postUrlFor, allPostLocales, allPostLocales.includes('en')),
          lastmod,
        ),
      );
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
