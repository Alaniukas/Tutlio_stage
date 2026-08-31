import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import {
  type Locale,
  detectDomain,
  buildCanonicalUrl,
  buildPublicPageCanonicalUrl,
  buildPlatformCanonicalUrl,
  localizedPagePath,
  canonicalDomain,
  hreflangCode,
} from './_lib/seo-routing.js';
import { evaluatePublicPageSeo } from '../src/lib/publicPage.js';
import { BLOG_SCHEMA_LOCALES, isSeoPublished, seoLocalesForPath } from '../src/lib/i18n/localeRelease.js';

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } }) as any;
}

/** Bump when marketing copy meaningfully changes — emitted as <lastmod>. */
const STATIC_LASTMOD = '2026-08-10';

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
  plainPage('/features/digital-business-card', 'monthly', '0.8'),
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

const TITLE_COLUMNS = BLOG_SCHEMA_LOCALES.map((l) => `title_${l}`).join(', ');
const SLUG_COLUMNS = BLOG_SCHEMA_LOCALES.map((l) => `slug_${l}`).join(', ');

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

export function publicPageBelongsInSitemap(
  page: Record<string, unknown>,
  tutorIdsWithOfferings: ReadonlySet<string>,
): boolean {
  const ownerType = page.owner_type === 'tutor' || page.owner_type === 'organization'
    ? page.owner_type
    : null;
  if (!ownerType) return false;
  const userId = typeof page.user_id === 'string' ? page.user_id : null;
  const organizationId = typeof page.organization_id === 'string' ? page.organization_id : null;
  return evaluatePublicPageSeo({
    slug: typeof page.slug === 'string' ? page.slug : '',
    ownerType,
    locale: typeof page.locale === 'string' ? page.locale : '',
    displayName: typeof page.display_name === 'string' ? page.display_name : '',
    headline: typeof page.headline === 'string' ? page.headline : '',
    bio: typeof page.bio === 'string' ? page.bio : '',
    published: page.published === true,
    userId,
    organizationId,
    offeringCount: userId && tutorIdsWithOfferings.has(userId) ? 1 : 0,
  }).indexable;
}

/**
 * hreflang alternates for one URL. Spans every locale with content —
 * including locales canonical on the other Tutlio domains — so the
 * cross-domain hreflang cluster stays reciprocal in all three sitemaps.
 */
export function alternatesXmlFor(
  urlFor: (locale: Locale) => string,
  locales: readonly Locale[] = seoLocalesForPath(new URL(urlFor('en')).pathname),
  includeXDefault = true,
): string {
  const links = locales.map(
    (locale) => `    <xhtml:link rel="alternate" hreflang="${hreflangCode(locale)}" href="${urlFor(locale)}" />`,
  );
  if (includeXDefault && locales.includes('en')) {
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
  let publicPages: Record<string, unknown>[] = [];
  const tutorIdsWithOfferings = new Set<string>();
  if (supabase) {
    const [blogResult, publicPageResult] = await Promise.all([
      supabase
        .from('blog_posts')
        .select(`slug, ${SLUG_COLUMNS}, published_at, updated_at, ${TITLE_COLUMNS}`)
        .eq('status', 'published')
        .order('published_at', { ascending: false }),
      supabase
        .from('public_pages')
        .select('slug, locale, updated_at, owner_type, user_id, organization_id, display_name, headline, bio, published')
        .eq('published', true)
        .order('updated_at', { ascending: false }),
    ]);
    blogPosts = blogResult.data || [];
    // Older environments may not have the public_pages migration yet; the
    // static/blog sitemap must remain available while that migration rolls out.
    publicPages = publicPageResult.error ? [] : publicPageResult.data || [];

    // A tutor profile is only useful to searchers once it has at least one
    // actual server-owned subject. Fetch only owner ids, not subject content.
    const tutorIds = [...new Set(publicPages
      .filter((page) => page.owner_type === 'tutor' && typeof page.user_id === 'string')
      .map((page) => String(page.user_id)))];
    for (let offset = 0; offset < tutorIds.length; offset += 500) {
      const { data } = await supabase
        .from('subjects')
        .select('tutor_id')
        .in('tutor_id', tutorIds.slice(offset, offset + 500));
      for (const subject of data || []) {
        if (typeof subject.tutor_id === 'string') tutorIdsWithOfferings.add(subject.tutor_id);
      }
    }
  }

  const entries: string[] = [];
  const blogLocales = seoLocalesForPath('/blog');
  const myBlogDomainLocales = blogLocales.filter((l) => canonicalDomain(l) === domain);

  for (const page of STATIC_PAGES) {
    const myLocales = seoLocalesForPath(new URL(page.urlFor('en')).pathname).filter((l) => canonicalDomain(l) === domain);
    for (const locale of myLocales) {
      entries.push(
        urlEntry(page.urlFor(locale), page.changefreq, page.priority, alternatesXmlFor(page.urlFor), STATIC_LASTMOD),
      );
    }
  }

  // User-authored tutor/agency pages have exactly one authored locale. They
  // are self-canonical and must not advertise fabricated translated variants.
  for (const page of publicPages) {
    if (!publicPageBelongsInSitemap(page, tutorIdsWithOfferings)) continue;
    const slug = typeof page.slug === 'string' ? page.slug : '';
    const locale = typeof page.locale === 'string' && isSeoPublished(page.locale as Locale, '/tutor')
      ? page.locale as Locale
      : null;
    if (!slug || !locale || canonicalDomain(locale) !== domain) continue;
    const updatedAt = typeof page.updated_at === 'string' ? page.updated_at.split('T')[0] : undefined;
    entries.push(urlEntry(buildPublicPageCanonicalUrl(slug, locale), 'weekly', '0.6', '', updatedAt));
  }

  // Blog listing: <loc> for this domain's translated locales, alternates
  // across every translated locale on any domain.
  const blogUrlFor = (l: Locale) => buildCanonicalUrl('/blog', l);
  const myBlogLocales = myBlogDomainLocales.filter((l) => blogPosts.some((p) => postHasTranslation(p, l)));
  const allBlogLocales = blogLocales.filter((l) => blogPosts.some((p) => postHasTranslation(p, l)));
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
    const myPostLocales = myBlogDomainLocales.filter((l) => postHasTranslation(post, l));
    const allPostLocales = blogLocales.filter((l) => postHasTranslation(post, l));
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
