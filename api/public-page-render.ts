import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from './types';
import { deriveForTutor, EMPTY_DERIVED } from './_lib/publicPageDerived.js';
import type { PublicPageRow } from './_lib/publicPageRow.js';
import { isSsrMethod, rejectSsrMethod, sendSsrHtml } from './_lib/ssr-http.js';
import {
  type Locale,
  LOCALES,
  buildCanonicalUrl,
  buildPublicPageCanonicalUrl,
  canonicalDomain,
  detectDomain,
  esc,
  hreflangCode,
  preloadSsrLocales,
  renderShell,
} from './_lib/ssr-shell.js';
import {
  MIN_REVIEWS_FOR_AGGREGATE,
  evaluatePublicPageSeo,
  getDemoPage,
  rowToPublicPage,
  safePublicSocialUrl,
  type PublicPage,
  type PublicPageSeoEligibility,
} from '../src/lib/publicPage.js';

const PUBLIC_COLUMNS =
  'id, slug, owner_type, locale, display_name, headline, bio, tagline_text, tagline_emphasis, ' +
  'photo_url, cover_url, city, languages, timezone, brand_color, brand_color_secondary, ' +
  'brand_color_tertiary, accent_color, accent_text_color, backdrop_theme, socials, ' +
  'published, booking_enabled, user_id, organization_id, updated_at';

const DATE_LOCALES: Record<Locale, string> = {
  lt: 'lt-LT', en: 'en-GB', pl: 'pl-PL', lv: 'lv-LV', ee: 'et-EE',
  fr: 'fr-FR', es: 'es-ES', de: 'de-DE', se: 'sv-SE', dk: 'da-DK',
  fi: 'fi-FI', no: 'nb-NO', nl: 'nl-NL',
};

const LABELS: Record<Locale, {
  about: string;
  lessons: string;
  availability: string;
  languages: string;
  location: string;
  book: string;
  free: string;
  demo: string;
  reviews: string;
}> = {
  lt: { about: 'Apie', lessons: 'Pamokos ir kainos', availability: 'Artimiausi laisvi laikai', languages: 'Kalbos', location: 'Vieta', book: 'Rezervuoti pamoką', free: 'Nemokama', demo: 'Pavyzdinis puslapis', reviews: 'Atsiliepimai' },
  en: { about: 'About', lessons: 'Lessons and pricing', availability: 'Next available times', languages: 'Languages', location: 'Location', book: 'Book a lesson', free: 'Free', demo: 'Demo page', reviews: 'Reviews' },
  pl: { about: 'O nas', lessons: 'Lekcje i ceny', availability: 'Najbliższe wolne terminy', languages: 'Języki', location: 'Lokalizacja', book: 'Zarezerwuj lekcję', free: 'Bezpłatnie', demo: 'Strona demonstracyjna', reviews: 'Opinie' },
  lv: { about: 'Par', lessons: 'Nodarbības un cenas', availability: 'Tuvākie brīvie laiki', languages: 'Valodas', location: 'Atrašanās vieta', book: 'Rezervēt nodarbību', free: 'Bezmaksas', demo: 'Demo lapa', reviews: 'Atsauksmes' },
  ee: { about: 'Tutvustus', lessons: 'Tunnid ja hinnad', availability: 'Järgmised vabad ajad', languages: 'Keeled', location: 'Asukoht', book: 'Broneeri tund', free: 'Tasuta', demo: 'Näidisleht', reviews: 'Arvustused' },
  fr: { about: 'À propos', lessons: 'Cours et tarifs', availability: 'Prochaines disponibilités', languages: 'Langues', location: 'Lieu', book: 'Réserver un cours', free: 'Gratuit', demo: 'Page de démonstration', reviews: 'Avis' },
  es: { about: 'Acerca de', lessons: 'Clases y precios', availability: 'Próximos horarios disponibles', languages: 'Idiomas', location: 'Ubicación', book: 'Reservar una clase', free: 'Gratis', demo: 'Página de demostración', reviews: 'Reseñas' },
  de: { about: 'Über mich', lessons: 'Unterricht und Preise', availability: 'Nächste freie Termine', languages: 'Sprachen', location: 'Ort', book: 'Stunde buchen', free: 'Kostenlos', demo: 'Demoseite', reviews: 'Bewertungen' },
  se: { about: 'Om', lessons: 'Lektioner och priser', availability: 'Nästa lediga tider', languages: 'Språk', location: 'Plats', book: 'Boka en lektion', free: 'Gratis', demo: 'Demosida', reviews: 'Omdömen' },
  dk: { about: 'Om', lessons: 'Lektioner og priser', availability: 'Næste ledige tider', languages: 'Sprog', location: 'Sted', book: 'Book en lektion', free: 'Gratis', demo: 'Demoside', reviews: 'Anmeldelser' },
  fi: { about: 'Tietoa', lessons: 'Tunnit ja hinnat', availability: 'Seuraavat vapaat ajat', languages: 'Kielet', location: 'Sijainti', book: 'Varaa tunti', free: 'Maksuton', demo: 'Esittelysivu', reviews: 'Arvostelut' },
  no: { about: 'Om', lessons: 'Timer og priser', availability: 'Neste ledige tider', languages: 'Språk', location: 'Sted', book: 'Bestill en time', free: 'Gratis', demo: 'Demoside', reviews: 'Anmeldelser' },
  nl: { about: 'Over', lessons: 'Lessen en prijzen', availability: 'Eerstvolgende vrije momenten', languages: 'Talen', location: 'Locatie', book: 'Boek een les', free: 'Gratis', demo: 'Demopagina', reviews: 'Beoordelingen' },
};

function validLocale(value: string): Locale {
  return LOCALES.includes(value as Locale) ? value as Locale : 'en';
}

function jsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function safeExternalUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function money(value: number, locale: Locale): string {
  return new Intl.NumberFormat(DATE_LOCALES[locale], {
    style: 'currency',
    currency: locale === 'pl' ? 'PLN' : 'EUR',
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

async function loadPage(slug: string): Promise<{
  page: PublicPage;
  isDemo: boolean;
  seo: PublicPageSeoEligibility;
} | null> {
  const demo = getDemoPage(slug);
  if (demo) {
    return {
      page: demo,
      isDemo: true,
      seo: evaluatePublicPageSeo({
        slug: demo.slug,
        ownerType: demo.ownerType,
        locale: demo.locale,
        displayName: demo.displayName,
        headline: demo.headline,
        bio: demo.bio,
        published: demo.published,
        userId: demo.ownerType === 'tutor' ? 'demo' : null,
        organizationId: demo.ownerType === 'organization' ? 'demo' : null,
        offeringCount: demo.offerings.length,
      }),
    };
  }

  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase
    .from('public_pages')
    .select(PUBLIC_COLUMNS)
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as unknown as PublicPageRow;
  const derived = row.user_id
    ? await deriveForTutor(supabase, row.user_id, row.timezone || 'Europe/Vilnius')
    : EMPTY_DERIVED;
  return {
    page: rowToPublicPage(row as never, derived as never),
    isDemo: false,
    seo: evaluatePublicPageSeo({
      slug: row.slug,
      ownerType: row.owner_type,
      locale: row.locale,
      displayName: row.display_name,
      headline: row.headline,
      bio: row.bio,
      published: row.published,
      userId: row.user_id,
      organizationId: row.organization_id,
      offeringCount: derived.offerings.length,
    }),
  };
}

function profileJsonLd(page: PublicPage, canonicalUrl: string): string {
  const entityType = page.ownerType === 'organization' ? 'Organization' : 'Person';
  const sameAs = Object.entries(page.socials || {})
    .map(([provider, value]) => safePublicSocialUrl(provider, value))
    .filter((u): u is string => !!u);
  const offers = page.offerings.map((offering) => ({
    '@type': 'Offer',
    name: offering.title,
    description: offering.description || undefined,
    price: offering.publicPrice.toFixed(2),
    priceCurrency: page.locale === 'pl' ? 'PLN' : 'EUR',
    url: canonicalUrl,
    availability: 'https://schema.org/InStock',
    itemOffered: {
      '@type': 'Service',
      name: offering.title,
      description: offering.description || page.headline,
      provider: { '@id': `${canonicalUrl}#profile` },
    },
  }));

  const mainEntity: Record<string, unknown> = {
    '@type': entityType,
    '@id': `${canonicalUrl}#profile`,
    name: page.displayName,
    description: page.bio || page.headline,
    url: canonicalUrl,
    image: safeExternalUrl(page.photoUrl) || safeExternalUrl(page.coverUrl) || undefined,
    address: page.city ? { '@type': 'PostalAddress', addressLocality: page.city } : undefined,
    knowsLanguage: page.languages.length ? page.languages : undefined,
    sameAs: sameAs.length ? sameAs : undefined,
    makesOffer: offers.length ? offers : undefined,
  };
  // aggregateRating is valid on Organization but not Person in Schema.org.
  // Tutlio hosts reviews about independent organizations, so this is not the
  // organization's own first-party/self-serving markup.
  if (page.ownerType === 'organization' && page.reviewsEnabled && page.ratingAvg && page.ratingCount >= MIN_REVIEWS_FOR_AGGREGATE) {
    mainEntity.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: page.ratingAvg,
      reviewCount: page.ratingCount,
      bestRating: 5,
      worstRating: 1,
    };
  }

  return jsonLd({
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    '@id': canonicalUrl,
    url: canonicalUrl,
    name: `${page.displayName} | Tutlio`,
    description: page.headline,
    inLanguage: hreflangCode(page.locale),
    isPartOf: { '@id': `${buildCanonicalUrl('/', page.locale)}#website` },
    breadcrumb: { '@id': `${canonicalUrl}#breadcrumb` },
    mainEntity,
  });
}

function renderBody(page: PublicPage, isDemo: boolean): string {
  const locale = validLocale(page.locale);
  const labels = LABELS[locale];
  const photoUrl = safeExternalUrl(page.photoUrl);
  const offeringHtml = page.offerings.map((offering) => `
    <article class="card">
      <h3>${esc(offering.title)}</h3>
      ${offering.description ? `<p>${esc(offering.description)}</p>` : ''}
      <p><strong>${offering.publicPrice > 0 ? esc(money(offering.publicPrice, locale)) : labels.free}</strong> · ${offering.durationMinutes} min</p>
    </article>`).join('\n');
  const slotHtml = page.slots.slice(0, 8).map((slot) => {
    const date = new Date(slot.start);
    const label = new Intl.DateTimeFormat(DATE_LOCALES[locale], {
      timeZone: page.timezone,
      weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    }).format(date);
    return `<li><time datetime="${esc(slot.start)}">${esc(label)}</time></li>`;
  }).join('\n');
  const socialHtml = Object.entries(page.socials || {}).map(([name, rawUrl]) => {
    const url = safePublicSocialUrl(name, rawUrl);
    return url ? `<a href="${esc(url)}" rel="me ugc nofollow noopener noreferrer">${esc(name)}</a>` : '';
  }).filter(Boolean).join(' · ');
  const reviewsHtml = page.reviewsEnabled && page.ratingAvg && page.ratingCount > 0
    ? `<section class="section">
    <h2>${labels.reviews}</h2>
    <p><strong>${page.ratingAvg.toFixed(1)}/5</strong> · ${page.ratingCount}</p>
    ${page.reviews.length ? `<div class="grid">${page.reviews.slice(0, 6).map((review) => `<blockquote class="card"><p>${esc(review.comment)}</p><footer>— ${esc(review.authorDisplayName)}</footer></blockquote>`).join('')}</div>` : ''}
  </section>`
    : '';

  return `
<main>
  <section class="hero">
    ${isDemo ? `<p style="font-size:.85rem;font-weight:600;color:#6b7280">${labels.demo}</p>` : ''}
    ${photoUrl ? `<img src="${esc(photoUrl)}" alt="${esc(page.displayName)}" width="160" height="160" style="width:120px;height:120px;border-radius:999px;object-fit:cover;margin-bottom:18px" />` : ''}
    <h1>${esc(page.displayName)}</h1>
    <p>${esc(page.headline)}</p>
    <p>${[
      page.city ? `${labels.location}: ${page.city}` : '',
      page.languages.length ? `${labels.languages}: ${page.languages.join(', ')}` : '',
    ].filter(Boolean).map(esc).join(' · ')}</p>
    ${page.bookingEnabled && page.offerings.length ? `<a href="#booking" class="btn">${labels.book}</a>` : ''}
  </section>
  <section class="section">
    <h2>${labels.about}</h2>
    <p>${esc(page.bio || page.headline)}</p>
    ${socialHtml ? `<p>${socialHtml}</p>` : ''}
  </section>
  ${page.offerings.length ? `<section class="section" id="booking"><h2>${labels.lessons}</h2><div class="grid">${offeringHtml}</div></section>` : ''}
  ${page.slots.length ? `<section class="section"><h2>${labels.availability}</h2><ul style="padding-left:20px">${slotHtml}</ul></section>` : ''}
  ${reviewsHtml}
</main>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isSsrMethod(req.method)) return rejectSsrMethod(res);
  const slug = typeof req.query.slug === 'string' ? req.query.slug.toLowerCase().trim() : '';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    res.setHeader('X-Robots-Tag', 'noindex');
    return res.status(404).send('Not found');
  }

  try {
    const loaded = await loadPage(slug);
    if (!loaded) {
      res.setHeader('X-Robots-Tag', 'noindex');
      return res.status(404).send('Not found');
    }

    const page = { ...loaded.page, locale: validLocale(loaded.page.locale) };
    const locale = page.locale;
    const canonicalUrl = buildPublicPageCanonicalUrl(page.slug, locale);
    const requestedPath = typeof req.query.requestedPath === 'string' ? req.query.requestedPath : '';
    const canonicalPath = new URL(canonicalUrl).pathname;
    if (canonicalDomain(locale) !== detectDomain(req) || (requestedPath && requestedPath !== canonicalPath)) {
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.redirect(308, canonicalUrl);
    }

    await preloadSsrLocales(locale, 'en', 'lt');
    const description = (page.headline || page.bio || page.displayName).replace(/\s+/g, ' ').trim().slice(0, 180);
    const title = `${page.displayName} — ${page.headline || LABELS[locale].lessons} | Tutlio`;
    const html = renderShell({
      locale,
      domain: detectDomain(req),
      path: canonicalPath,
      title,
      description,
      ogImage: safeExternalUrl(page.coverUrl) || safeExternalUrl(page.photoUrl) || undefined,
      ogType: page.ownerType === 'tutor' ? 'profile' : 'website',
      body: renderBody(page, loaded.isDemo),
      jsonLd: profileJsonLd(page, canonicalUrl),
      urlFor: () => canonicalUrl,
      hreflangHtml: '',
      showLocaleLinks: false,
      ogAlternateLocales: [],
      robots: loaded.isDemo || !loaded.seo.indexable ? 'noindex, follow' : undefined,
      breadcrumbs: [
        { name: 'Tutlio', url: new URL(canonicalUrl).origin },
        { name: page.displayName, url: canonicalUrl },
      ],
    });

    sendSsrHtml(req, res, html, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Language': hreflangCode(locale),
      'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      ...(loaded.isDemo || !loaded.seo.indexable ? { 'X-Robots-Tag': 'noindex, follow' } : {}),
    });
  } catch (error) {
    console.error('[public-page-render]', error);
    res.setHeader('X-Robots-Tag', 'noindex');
    return res.status(500).send('Internal error');
  }
}
