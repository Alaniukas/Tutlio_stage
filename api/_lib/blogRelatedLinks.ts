import type { SupabaseClient } from '@supabase/supabase-js';
import { type Locale, LOCALES, buildCanonicalUrl } from './seo-routing.js';

export type BlogAutoLocale = 'lt' | 'en' | 'pl';

const BLOG_LOCALES: BlogAutoLocale[] = ['lt', 'en', 'pl'];

export interface RelatedBlogPost {
  id: string;
  slug: string;
  title: string;
  tag: string;
  url: string;
}

function postSlug(post: Record<string, unknown>, locale: Locale): string {
  return (post[`slug_${locale}`] as string) || (post.slug as string);
}

function resolveField(post: Record<string, unknown>, field: string, locale: Locale): string {
  return (post[`${field}_${locale}`] as string) || (post[`${field}_en`] as string) || (post[`${field}_lt`] as string) || '';
}

export async function fetchRelatedBlogPosts(
  supabase: SupabaseClient,
  opts: { tag?: string; excludeId?: string; limit?: number },
): Promise<Record<string, unknown>[]> {
  const limit = opts.limit ?? 3;
  let query = supabase
    .from('blog_posts')
    .select('id, slug, tag, published_at, title_lt, title_en, title_pl, slug_lt, slug_en, slug_pl')
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(limit + 5);

  if (opts.excludeId) query = query.neq('id', opts.excludeId);
  if (opts.tag) query = query.eq('tag', opts.tag);

  const { data } = await query;
  return (data || []).slice(0, limit);
}

export function relatedPostsForLocale(
  posts: Record<string, unknown>[],
  locale: Locale,
): RelatedBlogPost[] {
  return posts
    .map((post) => {
      const title = resolveField(post, 'title', locale);
      const slug = postSlug(post, locale);
      if (!title || !slug) return null;
      return {
        id: String(post.id),
        slug,
        title,
        tag: String(post.tag || ''),
        url: buildCanonicalUrl(`/blog/${slug}`, locale),
      };
    })
    .filter((p): p is RelatedBlogPost => !!p);
}

const ABOUT_BLOCK: Record<BlogAutoLocale, string> = {
  lt:
    '\n\n---\n\n## Apie Tutlio\n\n' +
    'Tutlio — korepetitorių ir korepetavimo mokyklų valdymo platforma: pamokų tvarkaraštis, mokinių laukimo eilė, Stripe mokėjimai ir automatizuoti priminimai vienoje vietoje. ' +
    '[Sužinokite daugiau apie kainas](/pricing) arba [peržiūrėkite kitus straipsnius](/blog).',
  en:
    '\n\n---\n\n## About Tutlio\n\n' +
    'Tutlio is tutoring management software for private tutors and tutoring schools — lesson scheduling, student waitlist, Stripe payments, and automated reminders in one place. ' +
    '[See pricing](/pricing) or [browse more articles](/blog).',
  pl:
    '\n\n---\n\n## O Tutlio\n\n' +
    'Tutlio to oprogramowanie do zarządzania korepetycjami dla prywatnych korepetytorów i szkół — harmonogram lekcji, lista oczekujących, płatności Stripe i automatyczne przypomnienia w jednym miejscu. ' +
    '[Zobacz cennik](/pricing) lub [przeglądaj więcej artykułów](/blog).',
};

const RELATED_HEADING: Record<BlogAutoLocale, string> = {
  lt: '## Skaitykite taip pat',
  en: '## Read also',
  pl: '## Przeczytaj także',
};

function relatedMarkdownSection(related: RelatedBlogPost[], locale: BlogAutoLocale): string {
  if (!related.length) return '';
  const lines = related.map((p) => `- [${p.title}](/blog/${p.slug})`);
  return `\n\n${RELATED_HEADING[locale]}\n\n${lines.join('\n')}`;
}

/** Append about block + related links to generated locale content (idempotent). */
export function enrichBlogLocaleContent(
  content: string,
  locale: BlogAutoLocale,
  related: RelatedBlogPost[],
): string {
  let out = content.trimEnd();
  if (!out.includes('## Apie Tutlio') && !out.includes('## About Tutlio') && !out.includes('## O Tutlio')) {
    out += ABOUT_BLOCK[locale];
  }
  if (related.length && !out.includes(RELATED_HEADING[locale])) {
    out += relatedMarkdownSection(related, locale);
  }
  return out;
}

export async function enrichBlogPostContents(
  supabase: SupabaseClient,
  postId: string,
  tag: string,
): Promise<void> {
  const relatedRows = await fetchRelatedBlogPosts(supabase, { tag, excludeId: postId, limit: 3 });
  const patch: Record<string, string> = {};

  for (const loc of BLOG_LOCALES) {
    const { data: post } = await supabase
      .from('blog_posts')
      .select(`content_${loc}`)
      .eq('id', postId)
      .maybeSingle();
    const current = String(post?.[`content_${loc}`] || '');
    if (!current) continue;
    const related = relatedPostsForLocale(relatedRows, loc);
    patch[`content_${loc}`] = enrichBlogLocaleContent(current, loc, related);
  }

  if (Object.keys(patch).length) {
    await supabase.from('blog_posts').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', postId);
  }
}

export function renderRelatedPostsHtml(related: RelatedBlogPost[], locale: Locale): string {
  if (!related.length) return '';
  const heading =
    locale === 'lt' ? 'Skaitykite taip pat' :
    locale === 'pl' ? 'Przeczytaj także' :
    'Read also';
  const items = related
    .map((p) => `<li><a href="${p.url.replace(/"/g, '&quot;')}">${p.title.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</a></li>`)
    .join('\n');
  return `<section class="related" style="margin-top:2.5em;padding-top:1.5em;border-top:1px solid #e5e7eb">
  <h2 style="font-size:1.25rem;font-weight:700;margin-bottom:.75em">${heading}</h2>
  <ul style="margin:0;padding-left:1.25em">${items}</ul>
</section>`;
}

export function renderAboutTutlioHtml(locale: Locale, pricingUrl: string, blogUrl: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const blocks: Record<Locale, { title: string; body: string; pricing: string; blog: string }> = {
    lt: {
      title: 'Apie Tutlio',
      body: 'Tutlio — korepetitorių ir korepetavimo mokyklų valdymo platforma: pamokų tvarkaraštis, mokinių laukimo eilė, Stripe mokėjimai ir automatizuoti priminimai vienoje vietoje.',
      pricing: 'Sužinokite daugiau apie kainas',
      blog: 'peržiūrėkite kitus straipsnius',
    },
    en: {
      title: 'About Tutlio',
      body: 'Tutlio is tutoring management software for private tutors and tutoring schools — lesson scheduling, student waitlist, Stripe payments, and automated reminders in one place.',
      pricing: 'See pricing',
      blog: 'browse more articles',
    },
    pl: {
      title: 'O Tutlio',
      body: 'Tutlio to oprogramowanie do zarządzania korepetycjami — harmonogram lekcji, lista oczekujących, płatności Stripe i automatyczne przypomnienia w jednym miejscu.',
      pricing: 'Zobacz cennik',
      blog: 'przeglądaj więcej artykułów',
    },
    lv: { title: 'About Tutlio', body: 'Tutlio is tutoring management software for private tutors and tutoring schools.', pricing: 'See pricing', blog: 'browse more articles' },
    ee: { title: 'About Tutlio', body: 'Tutlio is tutoring management software for private tutors and tutoring schools.', pricing: 'See pricing', blog: 'browse more articles' },
    fr: { title: 'About Tutlio', body: 'Tutlio is tutoring management software for private tutors and tutoring schools.', pricing: 'See pricing', blog: 'browse more articles' },
    es: { title: 'About Tutlio', body: 'Tutlio is tutoring management software for private tutors and tutoring schools.', pricing: 'See pricing', blog: 'browse more articles' },
    de: { title: 'About Tutlio', body: 'Tutlio is tutoring management software for private tutors and tutoring schools.', pricing: 'See pricing', blog: 'browse more articles' },
    se: { title: 'About Tutlio', body: 'Tutlio is tutoring management software for private tutors and tutoring schools.', pricing: 'See pricing', blog: 'browse more articles' },
    dk: { title: 'About Tutlio', body: 'Tutlio is tutoring management software for private tutors and tutoring schools.', pricing: 'See pricing', blog: 'browse more articles' },
    fi: { title: 'About Tutlio', body: 'Tutlio is tutoring management software for private tutors and tutoring schools.', pricing: 'See pricing', blog: 'browse more articles' },
    no: { title: 'About Tutlio', body: 'Tutlio is tutoring management software for private tutors and tutoring schools.', pricing: 'See pricing', blog: 'browse more articles' },
  };
  const b = blocks[locale] || blocks.en;
  return `<section class="about-tutlio" style="margin-top:2.5em;padding:1.25em 1.5em;background:#f8f9ff;border-radius:12px;border:1px solid #e0e7ff">
  <h2 style="font-size:1.15rem;font-weight:700;margin-bottom:.5em">${esc(b.title)}</h2>
  <p style="margin:0;color:#444">${esc(b.body)} <a href="${esc(pricingUrl)}">${esc(b.pricing)}</a> · <a href="${esc(blogUrl)}">${esc(b.blog)}</a></p>
</section>`;
}

export { LOCALES };
