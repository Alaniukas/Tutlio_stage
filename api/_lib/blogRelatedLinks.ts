import {
  BLOG_SCHEMA_LOCALES as LOCALES,
  isSeoPublished,
  type BlogSchemaLocale,
} from '../../src/lib/i18n/localeRelease.js';
import { withEnglishLocaleFallback } from '../../src/lib/i18n/locales.js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { type Locale, buildCanonicalUrl } from './seo-routing.js';

const BLOG_LOCALES = LOCALES;

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

const RELATED_LOCALE_COLUMNS = LOCALES.flatMap((locale) => [
  `title_${locale}`,
  `slug_${locale}`,
]).join(', ');

export async function fetchRelatedBlogPosts(
  supabase: SupabaseClient,
  opts: { tag?: string; excludeId?: string; limit?: number },
): Promise<Record<string, unknown>[]> {
  const limit = opts.limit ?? 3;
  let query = supabase
    .from('blog_posts')
    .select(`id, slug, tag, published_at, ${RELATED_LOCALE_COLUMNS}`)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(limit + 5);

  if (opts.excludeId) query = query.neq('id', opts.excludeId);
  if (opts.tag) query = query.eq('tag', opts.tag);

  const { data } = await query;
  // Keep the small over-fetch: locale filtering happens afterwards and the
  // newest rows may not all have the requested translation.
  return (data || []) as unknown as Record<string, unknown>[];
}

export function relatedPostsForLocale(
  posts: Record<string, unknown>[],
  locale: Locale,
  limit = 3,
): RelatedBlogPost[] {
  if (!isSeoPublished(locale, '/blog')) return [];
  return posts
    .map((post) => {
      // Related links must be real translations. Linking a French article to
      // an English fallback URL creates mixed-language UX and crawl waste.
      const title = String(post[`title_${locale}`] || '');
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
    .filter((p): p is RelatedBlogPost => !!p)
    .slice(0, limit);
}

const ABOUT_BLOCK: Record<BlogSchemaLocale, string> = {
  lt:
    '\n\n---\n\n## Apie Tutlio\n\n' +
    'Tutlio - korepetitorių ir korepetavimo mokyklų valdymo platforma: pamokų tvarkaraštis, mokinių laukimo eilė, Stripe mokėjimai ir automatizuoti priminimai vienoje vietoje. ' +
    '[Sužinokite daugiau apie kainas](/pricing) arba [peržiūrėkite kitus straipsnius](/blog).',
  en:
    '\n\n---\n\n## About Tutlio\n\n' +
    'Tutlio is tutoring management software for private tutors and tutoring schools - lesson scheduling, student waitlist, Stripe payments, and automated reminders in one place. ' +
    '[See pricing](/pricing) or [browse more articles](/blog).',
  pl:
    '\n\n---\n\n## O Tutlio\n\n' +
    'Tutlio to oprogramowanie do zarządzania korepetycjami dla prywatnych korepetytorów i szkół - harmonogram lekcji, lista oczekujących, płatności Stripe i automatyczne przypomnienia w jednym miejscu. ' +
    '[Zobacz cennik](/pricing) lub [przeglądaj więcej artykułów](/blog).',
  lv:
    '\n\n---\n\n## Par Tutlio\n\n' +
    'Tutlio ir privātskolotāju un mācību centru pārvaldības platforma ar nodarbību grafiku, gaidīšanas sarakstu, Stripe maksājumiem un automātiskiem atgādinājumiem. ' +
    '[Skatīt cenas](/pricing) vai [lasīt citus rakstus](/blog).',
  ee:
    '\n\n---\n\n## Tutlio kohta\n\n' +
    'Tutlio on eraõpetajate ja õppekeskuste haldusplatvorm, mis ühendab tunniplaani, ootenimekirja, Stripe’i maksed ja automaatsed meeldetuletused. ' +
    '[Vaata hindu](/pricing) või [loe teisi artikleid](/blog).',
  fr:
    '\n\n---\n\n## À propos de Tutlio\n\n' +
    'Tutlio est une plateforme de gestion pour professeurs particuliers et écoles, avec planning, liste d’attente, paiements Stripe et rappels automatiques. ' +
    '[Voir les tarifs](/pricing) ou [lire d’autres articles](/blog).',
  es:
    '\n\n---\n\n## Sobre Tutlio\n\n' +
    'Tutlio es una plataforma de gestión para profesores y academias con horarios, lista de espera, pagos con Stripe y recordatorios automáticos. ' +
    '[Ver precios](/pricing) o [leer más artículos](/blog).',
  de:
    '\n\n---\n\n## Über Tutlio\n\n' +
    'Tutlio ist eine Verwaltungsplattform für Nachhilfelehrer und Lerninstitute mit Terminplanung, Warteliste, Stripe-Zahlungen und automatischen Erinnerungen. ' +
    '[Preise ansehen](/pricing) oder [weitere Artikel lesen](/blog).',
  se:
    '\n\n---\n\n## Om Tutlio\n\n' +
    'Tutlio är en plattform för privatlärare och läxhjälpsföretag med schema, väntelista, Stripe-betalningar och automatiska påminnelser. ' +
    '[Se priser](/pricing) eller [läs fler artiklar](/blog).',
  dk:
    '\n\n---\n\n## Om Tutlio\n\n' +
    'Tutlio er en platform til privatundervisere og lektiehjælp med kalender, venteliste, Stripe-betalinger og automatiske påmindelser. ' +
    '[Se priser](/pricing) eller [læs flere artikler](/blog).',
  fi:
    '\n\n---\n\n## Tietoa Tutliosta\n\n' +
    'Tutlio on yksityisopettajien ja opetuskeskusten hallinta-alusta, jossa aikataulut, jonotuslista, Stripe-maksut ja automaattiset muistutukset ovat yhdessä paikassa. ' +
    '[Katso hinnat](/pricing) tai [lue lisää artikkeleita](/blog).',
  no:
    '\n\n---\n\n## Om Tutlio\n\n' +
    'Tutlio er en plattform for privatlærere og leksehjelpsbedrifter med kalender, venteliste, Stripe-betalinger og automatiske påminnelser. ' +
    '[Se priser](/pricing) eller [les flere artikler](/blog).',
  nl:
    '\n\n---\n\n## Over Tutlio\n\n' +
    'Tutlio is beheersoftware voor zelfstandige docenten en bijlesscholen, met lesplanning, wachtlijsten, Stripe-betalingen en automatische herinneringen op één plek. ' +
    '[Bekijk de prijzen](/pricing) of [bekijk meer artikelen](/blog).',
};

const RELATED_HEADING: Record<BlogSchemaLocale, string> = {
  lt: '## Skaitykite taip pat',
  en: '## Read also',
  pl: '## Przeczytaj także',
  lv: '## Lasiet arī',
  ee: '## Loe ka',
  fr: '## À lire aussi',
  es: '## Lee también',
  de: '## Auch lesenswert',
  se: '## Läs också',
  dk: '## Læs også',
  fi: '## Lue myös',
  no: '## Les også',
  nl: '## Lees ook',
};

function relatedMarkdownSection(related: RelatedBlogPost[], locale: BlogSchemaLocale): string {
  if (!related.length) return '';
  const lines = related.map((p) => `- [${p.title}](/blog/${p.slug})`);
  return `\n\n${RELATED_HEADING[locale]}\n\n${lines.join('\n')}`;
}

/** Append about block + related links to generated locale content (idempotent). */
export function enrichBlogLocaleContent(
  content: string,
  locale: BlogSchemaLocale,
  related: RelatedBlogPost[],
): string {
  let out = content.trimEnd();
  const about = ABOUT_BLOCK[locale];
  const aboutTitle = about.match(/^[\s\S]*## (.+)\n/)?.[1] || 'About Tutlio';
  if (!out.includes(`## ${aboutTitle}`) && !out.includes('## Apie Tutlio') && !out.includes('## About Tutlio')) {
    out += about;
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
  const heading: Record<Locale, string> = withEnglishLocaleFallback({
    tr: 'Bunları da okuyun', lt: 'Skaitykite taip pat', en: 'Read also', pl: 'Przeczytaj także', lv: 'Lasiet arī',
    ee: 'Loe ka', fr: 'À lire aussi', es: 'Lee también', de: 'Auch lesenswert',
    se: 'Läs också', dk: 'Læs også', fi: 'Lue myös', no: 'Les også', nl: 'Lees ook',
  });
  const items = related
    .map((p) => `<li><a href="${p.url.replace(/"/g, '&quot;')}">${p.title.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</a></li>`)
    .join('\n');
  return `<section class="related" style="margin-top:2.5em;padding-top:1.5em;border-top:1px solid #e5e7eb">
  <h2 style="font-size:1.25rem;font-weight:700;margin-bottom:.75em">${heading[locale]}</h2>
  <ul style="margin:0;padding-left:1.25em">${items}</ul>
</section>`;
}

export function renderAboutTutlioHtml(locale: Locale, pricingUrl: string, blogUrl: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const blocks: Record<Locale, { title: string; body: string; pricing: string; blog: string }> = withEnglishLocaleFallback({
    tr: { title: 'Tutlio hakkında', body: 'Tutlio, bağımsız özel ders öğretmenleri ve özel ders kurumları için yönetim yazılımıdır. Ders planlama, öğrenci bekleme listesi, Stripe ödemeleri ve otomatik hatırlatmalar tek yerde.', pricing: 'Fiyatları inceleyin', blog: 'diğer yazılara göz atın' },
    lt: {
      title: 'Apie Tutlio',
      body: 'Tutlio - korepetitorių ir korepetavimo mokyklų valdymo platforma: pamokų tvarkaraštis, mokinių laukimo eilė, Stripe mokėjimai ir automatizuoti priminimai vienoje vietoje.',
      pricing: 'Sužinokite daugiau apie kainas',
      blog: 'peržiūrėkite kitus straipsnius',
    },
    en: {
      title: 'About Tutlio',
      body: 'Tutlio is tutoring management software for private tutors and tutoring schools - lesson scheduling, student waitlist, Stripe payments, and automated reminders in one place.',
      pricing: 'See pricing',
      blog: 'browse more articles',
    },
    pl: {
      title: 'O Tutlio',
      body: 'Tutlio to oprogramowanie do zarządzania korepetycjami - harmonogram lekcji, lista oczekujących, płatności Stripe i automatyczne przypomnienia w jednym miejscu.',
      pricing: 'Zobacz cennik',
      blog: 'przeglądaj więcej artykułów',
    },
    lv: {
      title: 'Par Tutlio',
      body: 'Tutlio ir privātskolotāju un mācību centru pārvaldības platforma ar nodarbību grafiku, gaidīšanas sarakstu, Stripe maksājumiem un automātiskiem atgādinājumiem.',
      pricing: 'Skatīt cenas',
      blog: 'lasīt citus rakstus',
    },
    ee: {
      title: 'Tutlio kohta',
      body: 'Tutlio on eraõpetajate ja õppekeskuste haldusplatvorm, mis ühendab tunniplaani, ootenimekirja, Stripe’i maksed ja automaatsed meeldetuletused.',
      pricing: 'Vaata hindu',
      blog: 'loe teisi artikleid',
    },
    fr: {
      title: 'À propos de Tutlio',
      body: 'Tutlio est une plateforme de gestion pour professeurs particuliers et écoles, avec planning, liste d’attente, paiements Stripe et rappels automatiques.',
      pricing: 'Voir les tarifs',
      blog: 'lire d’autres articles',
    },
    es: {
      title: 'Sobre Tutlio',
      body: 'Tutlio es una plataforma de gestión para profesores y academias con horarios, lista de espera, pagos con Stripe y recordatorios automáticos.',
      pricing: 'Ver precios',
      blog: 'leer más artículos',
    },
    de: {
      title: 'Über Tutlio',
      body: 'Tutlio ist eine Verwaltungsplattform für Nachhilfelehrer und Lerninstitute mit Terminplanung, Warteliste, Stripe-Zahlungen und automatischen Erinnerungen.',
      pricing: 'Preise ansehen',
      blog: 'weitere Artikel lesen',
    },
    se: {
      title: 'Om Tutlio',
      body: 'Tutlio är en plattform för privatlärare och läxhjälpsföretag med schema, väntelista, Stripe-betalningar och automatiska påminnelser.',
      pricing: 'Se priser',
      blog: 'läs fler artiklar',
    },
    dk: {
      title: 'Om Tutlio',
      body: 'Tutlio er en platform til privatundervisere og lektiehjælp med kalender, venteliste, Stripe-betalinger og automatiske påmindelser.',
      pricing: 'Se priser',
      blog: 'læs flere artikler',
    },
    fi: {
      title: 'Tietoa Tutliosta',
      body: 'Tutlio on yksityisopettajien ja opetuskeskusten hallinta-alusta, jossa aikataulut, jonotuslista, Stripe-maksut ja automaattiset muistutukset ovat yhdessä paikassa.',
      pricing: 'Katso hinnat',
      blog: 'lue lisää artikkeleita',
    },
    no: {
      title: 'Om Tutlio',
      body: 'Tutlio er en plattform for privatlærere og leksehjelpsbedrifter med kalender, venteliste, Stripe-betalinger og automatiske påminnelser.',
      pricing: 'Se priser',
      blog: 'les flere artikler',
    },
    nl: {
      title: 'Over Tutlio',
      body: 'Tutlio is beheersoftware voor zelfstandige docenten en bijlesscholen, met lesplanning, wachtlijsten, Stripe-betalingen en automatische herinneringen op één plek.',
      pricing: 'Bekijk de prijzen',
      blog: 'bekijk meer artikelen',
    },
  });
  const b = blocks[locale] || blocks.en;
  return `<section class="about-tutlio" style="margin-top:2.5em;padding:1.25em 1.5em;background:#f8f9ff;border-radius:12px;border:1px solid #e0e7ff">
  <h2 style="font-size:1.15rem;font-weight:700;margin-bottom:.5em">${esc(b.title)}</h2>
  <p style="margin:0;color:#444">${esc(b.body)} <a href="${esc(pricingUrl)}">${esc(b.pricing)}</a> · <a href="${esc(blogUrl)}">${esc(b.blog)}</a></p>
</section>`;
}

export { LOCALES };
