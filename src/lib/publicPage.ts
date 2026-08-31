/**
 * Public tutor/agency landing pages ("vizitinė kortelė") — shared pure module.
 *
 * Deliberately dependency-free so both the SPA page and (later) the SSR
 * renderer in api/ can import it, the same way api/_lib/ssr-shell.ts already
 * imports src/lib/pricing.js.
 *
 * Page data now comes from the `public_pages` table via /api/public-page
 * (visitors) and /api/public-page-admin (the owner). The DEMO_PAGES fixtures
 * below survive only as the two showcase URLs linked from marketing pages.
 *
 * Shared interface labels live in CHROME, with English fallback for locales
 * whose public-page copy has not been translated yet.
 */

import type { Locale } from './i18n/core';
import { LOCALE_FORMAT_TAGS } from './i18n/locales';
import { isSeoPublished } from './i18n/localeRelease';
import { nlPublicPage } from './i18n/nlPublicPage';
import { publicPageSlotDay, publicPageTimeZone } from './publicPageTime';

/** Canonical domain for a locale — mirrors canonicalDomain() in api/_lib/seo-routing.ts. */
type DomainKey = 'lt' | 'com' | 'pl';

function canonicalDomainFor(locale: Locale): DomainKey {
  if (locale === 'lt') return 'lt';
  if (locale === 'pl') return 'pl';
  return 'com';
}

const PUBLIC_PAGE_ORIGINS: Record<DomainKey, string> = {
  lt: 'https://www.tutlio.lt',
  com: 'https://www.tutlio.com',
  pl: 'https://www.tutlio.pl',
};

/**
 * Localized public-page prefix. Keyed by DOMAIN, not locale — this matches
 * LOCALIZED_PAGE_PATHS in api/_lib/seo-routing.ts, so .pl gets the English
 * slug just like /about and /contacts do.
 */
export const PUBLIC_PAGE_PREFIX: Record<DomainKey, string> = {
  lt: '/korepetitorius',
  com: '/tutor',
  pl: '/tutor',
};

export function publicPagePath(slug: string, locale: Locale): string {
  const domain = canonicalDomainFor(locale);
  const localePrefix = domain === 'com' && locale !== 'en' ? `/${locale}` : '';
  return `${localePrefix}${PUBLIC_PAGE_PREFIX[domain]}/${slug}`;
}

export function publicPageCanonicalUrl(slug: string, locale: Locale): string {
  const domain = canonicalDomainFor(locale);
  return `${PUBLIC_PAGE_ORIGINS[domain]}${publicPagePath(slug, locale)}`;
}

/** Slugs that can never belong to a tutor — checked in the editor API, not the DB. */
export const RESERVED_SLUGS = new Set([
  'api', 'admin', 'login', 'register', 'book', 'review', 'assets', 'new', 'edit',
  'settings', 'pricing', 'blog', 'features', 'schools', 'teachers', 'contacts',
  'about', 'terms', 'privacy-policy', 'dpa', 'tutor', 'korepetitorius', 'embed',
]);

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && slug.length >= 3 && slug.length <= 80 && !RESERVED_SLUGS.has(slug);
}

export type PublicPageOwnerType = 'tutor' | 'organization';

export interface PublicPageOffering {
  id: string;
  title: string;
  description?: string;
  durationMinutes: number;
  /** Server-resolved price. Never trusted from the client — see the plan. */
  publicPrice: number;
  /** Group lessons render a different icon and, later, capacity. */
  group?: boolean;
}

/** Delivery format offered for a lesson — online and/or a physical location. */
export interface PublicPageFormat {
  id: string;
  kind: 'online' | 'onsite';
  label: string;
}

export interface PublicPageSocials {
  tiktok?: string;
  youtube?: string;
  x?: string;
  instagram?: string;
  facebook?: string;
}

/** Subject-themed backdrop watermark. Purely decorative. */
export type BackdropTheme = 'math' | 'language' | 'music' | 'plain';

export interface PublicPageReview {
  id: string;
  rating: number;
  comment: string;
  /** First name + last initial. The full student name never leaves the DB. */
  authorDisplayName: string;
  subjectName?: string;
  createdAt: string;
}

export interface PublicPageSlot {
  /** ISO start. Only free ranges are ever exposed publicly — never session ids. */
  start: string;
  durationMinutes: number;
}

export interface PublicPage {
  slug: string;
  ownerType: PublicPageOwnerType;
  locale: Locale;
  displayName: string;
  headline: string;
  bio: string;
  photoUrl?: string;
  /** Full-bleed backdrop image. When absent the brand gradient + watermark shows. */
  coverUrl?: string;
  /** Initials fallback while there is no uploaded photo. */
  initials: string;
  /** The "Go live" switch. Unpublished pages 404 for visitors. */
  published: boolean;
  /** Short hook under the identity block; `emphasis` renders in the accent colour. */
  tagline?: { text: string; emphasis?: string };
  brandColor: string;
  brandColorSecondary: string;
  /** Third gradient stop — the warm end of the backdrop. */
  brandColorTertiary?: string;
  /** Selection highlight. Deliberately separate from brandColor so the filled
   *  pill never collides with the CTA. */
  accentColor: string;
  accentTextColor: string;
  backdropTheme: BackdropTheme;
  city?: string;
  languages: string[];
  /** IANA zone the slot times are rendered in — shown so remote buyers aren't caught out. */
  timezone: string;
  formats: PublicPageFormat[];
  socials?: PublicPageSocials;
  offerings: PublicPageOffering[];
  slots: PublicPageSlot[];
  reviews: PublicPageReview[];
  ratingCount: number;
  ratingAvg: number | null;
  bookingEnabled: boolean;
  reviewsEnabled: boolean;
}

/** Aggregate rating is only structured-data-eligible above this count. */
export const MIN_REVIEWS_FOR_AGGREGATE = 3;

/**
 * Search engines should only receive profiles that are useful without any
 * private application context. Publishing remains an owner's visibility
 * choice; this separate gate decides whether the page is mature enough to be
 * indexed and listed in the sitemap.
 */
export type PublicPageSeoReason =
  | 'not-published'
  | 'invalid-slug'
  | 'invalid-locale'
  | 'missing-owner'
  | 'short-display-name'
  | 'short-headline'
  | 'short-bio'
  | 'duplicate-copy'
  | 'missing-offering';

export interface PublicPageSeoCandidate {
  slug: string;
  ownerType: PublicPageOwnerType;
  locale: string;
  displayName: string;
  headline: string;
  bio: string;
  published: boolean;
  userId?: string | null;
  organizationId?: string | null;
  offeringCount: number;
}

export interface PublicPageSeoEligibility {
  indexable: boolean;
  reasons: PublicPageSeoReason[];
}


function comparableCopy(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/**
 * Deliberately conservative thresholds: a one-line placeholder can still be
 * shared with customers, but it must not become a thin search result. Tutor
 * pages additionally need a real, server-derived subject/lesson offering.
 */
export function evaluatePublicPageSeo(candidate: PublicPageSeoCandidate): PublicPageSeoEligibility {
  const reasons: PublicPageSeoReason[] = [];
  const displayName = candidate.displayName.replace(/\s+/g, ' ').trim();
  const headline = candidate.headline.replace(/\s+/g, ' ').trim();
  const bio = candidate.bio.replace(/\s+/g, ' ').trim();

  if (!candidate.published) reasons.push('not-published');
  if (!isValidSlug(candidate.slug)) reasons.push('invalid-slug');
  if (!isSeoPublished(candidate.locale as Locale, '/tutor')) reasons.push('invalid-locale');

  const hasExpectedOwner = candidate.ownerType === 'tutor'
    ? Boolean(candidate.userId) && !candidate.organizationId
    : Boolean(candidate.organizationId) && !candidate.userId;
  if (!hasExpectedOwner) reasons.push('missing-owner');

  if (displayName.length < 3) reasons.push('short-display-name');
  if (headline.length < 20) reasons.push('short-headline');
  if (bio.length < 120) reasons.push('short-bio');

  const displayComparable = comparableCopy(displayName);
  const headlineComparable = comparableCopy(headline);
  const bioComparable = comparableCopy(bio);
  if (
    (headlineComparable && headlineComparable === displayComparable)
    || (bioComparable && (bioComparable === headlineComparable || bioComparable === displayComparable))
  ) {
    reasons.push('duplicate-copy');
  }

  if (candidate.ownerType === 'tutor' && candidate.offeringCount < 1) {
    reasons.push('missing-offering');
  }

  return { indexable: reasons.length === 0, reasons };
}

const SOCIAL_HOSTS: Record<keyof PublicPageSocials, readonly string[]> = {
  tiktok: ['tiktok.com'],
  youtube: ['youtube.com', 'youtu.be'],
  x: ['x.com', 'twitter.com'],
  instagram: ['instagram.com'],
  facebook: ['facebook.com', 'fb.com'],
};

/** Validates that a user-provided URL actually belongs to its named network. */
export function safePublicSocialUrl(
  provider: string,
  value: unknown,
): string | null {
  if (!(provider in SOCIAL_HOSTS)) return null;
  try {
    const url = new URL(String(value ?? '').trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    const hostname = url.hostname.toLowerCase().replace(/^(?:www\.|m\.)/, '');
    const allowed = SOCIAL_HOSTS[provider as keyof PublicPageSocials];
    if (!allowed.some((host) => hostname === host || hostname.endsWith(`.${host}`))) return null;
    url.protocol = 'https:';
    return url.toString();
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* DB row <-> PublicPage                                               */
/* ------------------------------------------------------------------ */

/** Exactly the `public_pages` columns. Snake case, straight from PostgREST. */
export interface PublicPageRow {
  id: string;
  user_id: string | null;
  organization_id: string | null;
  slug: string;
  owner_type: PublicPageOwnerType;
  locale: string;
  display_name: string;
  headline: string;
  bio: string;
  tagline_text: string | null;
  tagline_emphasis: string | null;
  photo_url: string | null;
  cover_url: string | null;
  city: string | null;
  languages: string[] | null;
  timezone: string;
  brand_color: string;
  brand_color_secondary: string;
  brand_color_tertiary: string;
  accent_color: string;
  accent_text_color: string;
  backdrop_theme: BackdropTheme;
  socials: PublicPageSocials | null;
  published: boolean;
  booking_enabled: boolean;
  updated_at?: string;
}

/**
 * Everything the page shows that is NOT owner-editable. Derived server-side
 * from subjects / availability / sessions so an owner can never inflate their
 * own prices, invent free slots, or fake a rating.
 */
export interface PublicPageDerived {
  offerings: PublicPageOffering[];
  slots: PublicPageSlot[];
  reviews: PublicPageReview[];
  ratingCount: number;
  ratingAvg: number | null;
}

export const EMPTY_DERIVED: PublicPageDerived = {
  offerings: [], slots: [], reviews: [], ratingCount: 0, ratingAvg: null,
};

/** Uppercase initials from a display name — the avatar fallback. */
export function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return '?';
  return parts.map((p) => [...p][0]!.toUpperCase()).join('');
}

/**
 * Best-effort slug from a display name. Latin-folds the Lithuanian diacritics
 * so "Rasa Žukauskaitė" becomes "rasa-zukauskaite" rather than dropping half
 * the letters. The API still uniquifies and validates whatever comes back.
 */
export function slugify(name: string): string {
  const folded = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return folded
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

export function rowToPublicPage(row: PublicPageRow, derived: PublicPageDerived): PublicPage {
  const taglineText = row.tagline_text?.trim();
  return {
    slug: row.slug,
    ownerType: row.owner_type,
    locale: row.locale as Locale,
    displayName: row.display_name,
    headline: row.headline,
    bio: row.bio,
    photoUrl: row.photo_url ?? undefined,
    coverUrl: row.cover_url ?? undefined,
    initials: initialsFrom(row.display_name),
    published: row.published,
    tagline: taglineText
      ? { text: taglineText, emphasis: row.tagline_emphasis ?? undefined }
      : undefined,
    brandColor: row.brand_color,
    brandColorSecondary: row.brand_color_secondary,
    brandColorTertiary: row.brand_color_tertiary,
    accentColor: row.accent_color,
    accentTextColor: row.accent_text_color,
    backdropTheme: row.backdrop_theme,
    city: row.city ?? undefined,
    languages: row.languages ?? [],
    timezone: publicPageTimeZone(row.timezone),
    // Formats are implied by the presence of a city: online is always offered,
    // on-site only when the owner named a place.
    formats: [
      { id: 'online', kind: 'online', label: row.locale === 'el' ? 'Διαδικτυακά' : row.locale === 'uk' ? 'Онлайн' : row.locale === 'th' ? 'ออนไลน์' : row.locale === 'tr' ? 'Çevrim içi' : row.locale === 'lt' ? 'Nuotoliu' : row.locale === 'ar' ? 'عبر الإنترنت' : row.locale === 'he' ? 'מקוון' : 'Online' },
      ...(row.city
        ? [{ id: 'onsite', kind: 'onsite' as const, label: row.city }]
        : []),
    ],
    socials: row.socials ?? undefined,
    offerings: derived.offerings,
    slots: derived.slots,
    reviews: derived.reviews,
    ratingCount: derived.ratingCount,
    ratingAvg: derived.ratingAvg,
    bookingEnabled: row.booking_enabled,
    reviewsEnabled: derived.reviews.length > 0,
  };
}

export interface ResolvedBrand {
  primary: string;
  secondary: string;
  tertiary: string;
  accent: string;
  accentText: string;
  /** Full-bleed page backdrop built from the three stops. */
  backdrop: string;
}

export function resolveBrand(page: PublicPage): ResolvedBrand {
  const primary = page.brandColor || '#3b1e6e';
  const secondary = page.brandColorSecondary || primary;
  const tertiary = page.brandColorTertiary || secondary;
  return {
    primary,
    secondary,
    tertiary,
    accent: page.accentColor || '#d7f07a',
    accentText: page.accentTextColor || '#1f2937',
    backdrop: `linear-gradient(165deg, ${primary} 0%, ${secondary} 45%, ${tertiary} 100%)`,
  };
}

/**
 * Lithuanian CLDR renders `{month:'short'}` numerically ("08-01"), which reads
 * like a date code rather than a day. Use the conventional abbreviations.
 */
const LT_SHORT_MONTHS = [
  'Saus.', 'Vas.', 'Kov.', 'Bal.', 'Geg.', 'Birž.',
  'Liep.', 'Rugp.', 'Rugs.', 'Spal.', 'Lapkr.', 'Gruod.',
];

/** `dayIso` is a YYYY-MM-DD calendar day. */
export function formatShortDay(dayIso: string, locale: Locale): string {
  if (locale === 'cs') return new Date(`${dayIso}T12:00:00`).toLocaleDateString(LOCALE_FORMAT_TAGS.cs, { month: 'short', day: 'numeric' });
  if (locale === 'nl') return new Date(`${dayIso}T12:00:00`).toLocaleDateString(LOCALE_FORMAT_TAGS.nl, { month: 'short', day: 'numeric' });
  if (locale === 'sl') return new Date(`${dayIso}T12:00:00`).toLocaleDateString(LOCALE_FORMAT_TAGS.sl, { month: 'short', day: 'numeric' });
  if (locale === 'el') return new Date(`${dayIso}T12:00:00`).toLocaleDateString(LOCALE_FORMAT_TAGS.el, { month: 'short', day: 'numeric' });
  if (locale === 'uk') return new Date(`${dayIso}T12:00:00`).toLocaleDateString(LOCALE_FORMAT_TAGS.uk, { month: 'short', day: 'numeric' });
  if (locale === 'hu') return new Date(`${dayIso}T12:00:00`).toLocaleDateString(LOCALE_FORMAT_TAGS.hu, { month: 'short', day: 'numeric' });
  if (locale === 'sk') return new Date(`${dayIso}T12:00:00`).toLocaleDateString(LOCALE_FORMAT_TAGS.sk, { month: 'short', day: 'numeric' });
  if (locale === 'bg') return new Date(`${dayIso}T12:00:00`).toLocaleDateString('bg-BG', { month: 'short', day: 'numeric' });
  if (locale === 'hr') return new Date(`${dayIso}T12:00:00`).toLocaleDateString(LOCALE_FORMAT_TAGS.hr, { month: 'short', day: 'numeric' });
  if (locale === 'th') return new Date(`${dayIso}T12:00:00`).toLocaleDateString(LOCALE_FORMAT_TAGS.th, { month: 'short', day: 'numeric' });
  if (locale === 'he') return new Date(`${dayIso}T12:00:00`).toLocaleDateString(LOCALE_FORMAT_TAGS.he, { month: 'short', day: 'numeric' });
  if (locale === 'ro') return new Date(`${dayIso}T12:00:00`).toLocaleDateString('ro-RO', { month: 'short', day: 'numeric' });
  if (locale === 'zh-hk') return new Date(`${dayIso}T12:00:00`).toLocaleDateString('zh-HK', { month: 'short', day: 'numeric' });
  if (locale === 'pt') return new Date(`${dayIso}T12:00:00`).toLocaleDateString('pt-PT', { month: 'short', day: 'numeric' });
  if (locale === 'tr') return new Date(`${dayIso}T12:00:00`).toLocaleDateString('tr-TR', { month: 'short', day: 'numeric' });
  if (locale === 'fil') return new Date(`${dayIso}T12:00:00`).toLocaleDateString('fil-PH', { month: 'short', day: 'numeric' });
  if (locale === 'ja') {
    return new Date(`${dayIso}T12:00:00`).toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
  }
  if (locale === 'hi') {
    return new Date(`${dayIso}T12:00:00`).toLocaleDateString('hi-IN', { month: 'short', day: 'numeric' });
  }
  if (locale === 'ko') {
    return new Date(`${dayIso}T12:00:00`).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
  }
  if (locale === 'id') {
    return new Date(`${dayIso}T12:00:00`).toLocaleDateString('id-ID', { month: 'short', day: 'numeric' });
  }
  if (locale === 'ar') {
    return new Date(dayIso + 'T12:00:00').toLocaleDateString(LOCALE_FORMAT_TAGS.ar, { month: 'short', day: 'numeric' });
  }
  const d = new Date(`${dayIso}T00:00:00`);
  if (locale === 'lt') return `${LT_SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.toLocaleDateString(locale === 'pt-br' ? 'pt-BR' : locale === 'es-mx' ? 'es-MX' : locale === 'it' ? 'it-IT' : 'en-GB', { month: 'short', day: 'numeric' });
}

/** Upcoming slots grouped by calendar day, for the availability picker. */
export function groupSlotsByDay(slots: PublicPageSlot[], timeZone?: string): { day: string; slots: PublicPageSlot[] }[] {
  const byDay = new Map<string, PublicPageSlot[]>();
  for (const slot of slots) {
    const day = timeZone ? publicPageSlotDay(slot.start, timeZone) : slot.start.slice(0, 10);
    const bucket = byDay.get(day);
    if (bucket) bucket.push(slot);
    else byDay.set(day, [slot]);
  }
  return [...byDay.entries()].map(([day, s]) => ({ day, slots: s }));
}

/* ------------------------------------------------------------------ */
/* Shared interface copy. Page content (name, bio, subjects) remains  */
/* fixture/DB data and is never translated here.                       */
/* ------------------------------------------------------------------ */

export const CHROME = {
  cs: {
    demoBanner: 'Prototyp — ukázková data. Skutečné rezervace a platby zatím nejsou připojeny.',
    book: 'Rezervovat lekci', bookShort: 'Rezervovat', about: 'O mně',
    subjects: 'Lekce a ceny', availability: 'Nejbližší volné termíny',
    reviews: 'Recenze', noReviews: 'Zatím žádné recenze.',
    reviewsOnlyStudents: 'Recenzi mohou přidat pouze studenti, kteří absolvovali lekce.',
    perLesson: 'za lekci', minutes: 'min', poweredBy: 'Používá platformu',
    selectSlot: 'Vyberte termín', yourDetails: 'Vaše údaje', payment: 'Platba',
    fullName: 'Jméno a příjmení', email: 'E-mail', phone: 'Telefon (nepovinné)',
    continue: 'Pokračovat', back: 'Zpět', lessonPrice: 'Cena lekce',
    serviceFee: 'Servisní poplatek', total: 'Celkem', payNow: 'Zaplatit',
    prototypeNotice: 'V prototypu se platba neprovede. Ve skutečném procesu se otevře Stripe Checkout; po úspěšné platbě se lekce rezervuje a e-mailem se odešle odkaz na účet.',
    close: 'Zavřít', reviewCount: 'hodnocení', languages: 'Jazyky', verified: 'Ověřeno',
    selected: 'Vybráno', stepLesson: '1. Vyberte lekci', stepTime: '2. Vyberte termín',
    pickFormat: 'Vyberte formu', pickDate: 'Vyberte datum', pickTime: 'Vyberte čas',
    duration: 'Délka', price: 'Cena', timeShownIn: 'Časy jsou uvedeny v časovém pásmu:',
    continueBooking: 'Pokračovat v žádosti', trustLine: 'Nezávazně · odpověď e-mailem',
    linkLessons: 'Lekce a ceny', linkAbout: 'Jak probíhají lekce', linkReviews: 'Recenze studentů',
    bookLesson: 'Rezervovat lekci', free: 'Zdarma', change: 'Změnit',
    linkBook: 'Rezervovat termín', linkAboutMe: 'O mně', linkAboutUs: 'O nás',
    backToMenu: 'Zpět', bookThis: 'Rezervovat', basedIn: 'Místo', lessonsGiven: 'Hodnocení',
    statusDraft: 'Koncept', statusLive: 'Zveřejněno',
    notLiveTitle: 'Tato stránka ještě není zveřejněna',
    notLiveBody: 'Vlastník ji zatím nezveřejnil. Po zveřejnění bude viditelná pro všechny.',
    loading: 'Načítání…', notFoundTitle: 'Stránka nebyla nalezena',
    notFoundBody: 'Tato adresa neexistuje nebo stránka již není zveřejněna.',
    enquiryIntro: 'Zanechte své údaje — ozveme se vám a potvrdíme termín.',
    messageLabel: 'Zpráva (nepovinné)', sendEnquiry: 'Odeslat žádost', sending: 'Odesílání…',
    enquirySentTitle: 'Žádost byla odeslána',
    enquirySentBody: 'Vaši žádost jsme obdrželi — pro potvrzení termínu vás kontaktujeme e-mailem nebo telefonicky.',
    enquiryFailed: 'Odeslání se nezdařilo. Zkuste to znovu.',
    enquiryTooMany: 'Příliš mnoho žádostí za sebou. Zkuste to později.',
    noSlots: 'Momentálně nejsou vypsané volné termíny — pošlete žádost a domluvíme se.',
    noOfferings: 'Seznam lekcí se ještě připravuje.', yourRequest: 'Vaše žádost', anyTime: 'Libovolný čas',
  },
  nl: nlPublicPage,
  sl: {
    demoBanner: 'Prototip — vzorčni podatki. Prave rezervacije in plačila še niso povezani.',
    book: 'Rezerviraj uro',
    bookShort: 'Rezerviraj',
    about: 'Predstavitev',
    subjects: 'Ure in cene',
    availability: 'Naslednji prosti termini',
    reviews: 'Mnenja',
    noReviews: 'Mnenj še ni.',
    reviewsOnlyStudents: 'Mnenje lahko oddajo samo učenci, ki so se že udeležili ur.',
    perLesson: 'na uro',
    minutes: 'min',
    poweredBy: 'Omogoča',
    selectSlot: 'Izberite termin',
    yourDetails: 'Vaši podatki',
    payment: 'Plačilo',
    fullName: 'Ime in priimek',
    email: 'E-poštni naslov',
    phone: 'Telefon (neobvezno)',
    continue: 'Nadaljuj',
    back: 'Nazaj',
    lessonPrice: 'Cena ure',
    serviceFee: 'Strošek storitve',
    total: 'Skupaj',
    payNow: 'Plačaj',
    prototypeNotice: 'V prototipu se plačilo ne izvede. V dejanskem postopku se odpre Stripe Checkout, po uspešnem plačilu pa se ura rezervira in povezava do uporabniškega računa pošlje po e-pošti.',
    close: 'Zapri',
    reviewCount: 'mnenj',
    languages: 'Jeziki',
    verified: 'Preverjeno',
    selected: 'Izbrano',
    stepLesson: '1. Izberite uro',
    stepTime: '2. Izberite termin',
    pickFormat: 'Izberite način izvedbe',
    pickDate: 'Izberite datum',
    pickTime: 'Izberite čas',
    duration: 'Trajanje',
    price: 'Cena',
    timeShownIn: 'Časi so prikazani v:',
    continueBooking: 'Nadaljuj povpraševanje',
    trustLine: 'Brez obveznosti · odgovor po e-pošti',
    linkLessons: 'Ure in cene',
    linkAbout: 'Kako potekajo ure',
    linkReviews: 'Mnenja učencev',
    bookLesson: 'Rezerviraj uro',
    free: 'Brezplačno',
    change: 'Spremeni',
    linkBook: 'Rezerviraj termin',
    linkAboutMe: 'O meni',
    linkAboutUs: 'O nas',
    backToMenu: 'Nazaj',
    bookThis: 'Rezerviraj',
    basedIn: 'Lokacija',
    lessonsGiven: 'Ocena',
    statusDraft: 'Osnutek',
    statusLive: 'Objavljeno',
    notLiveTitle: 'Ta stran še ni objavljena',
    notLiveBody: 'Lastnik je še ni objavil. Po objavi bo vidna vsem.',
    loading: 'Nalaganje…',
    notFoundTitle: 'Strani ni mogoče najti',
    notFoundBody: 'Ta naslov ne obstaja ali pa stran ni več objavljena.',
    enquiryIntro: 'Pustite svoje podatke — stopili bomo v stik z vami in potrdili termin.',
    messageLabel: 'Sporočilo (neobvezno)',
    sendEnquiry: 'Pošlji povpraševanje',
    sending: 'Pošiljanje…',
    enquirySentTitle: 'Povpraševanje je poslano',
    enquirySentBody: 'Vaše povpraševanje je prejeto — za potrditev termina vas bomo kontaktirali po e-pošti ali telefonu.',
    enquiryFailed: 'Pošiljanje ni uspelo. Poskusite znova.',
    enquiryTooMany: 'Preveč zaporednih povpraševanj. Poskusite pozneje.',
    noSlots: 'Trenutno ni navedenih prostih terminov — pošljite povpraševanje in se bomo dogovorili.',
    noOfferings: 'Seznam ur je še v pripravi.',
    yourRequest: 'Vaše povpraševanje',
    anyTime: 'Kadar koli',
  },
  el: {
    demoBanner: 'Πρωτότυπο — ενδεικτικά δεδομένα. Οι πραγματικές κρατήσεις και πληρωμές δεν έχουν συνδεθεί ακόμη.',
    book: 'Κράτηση μαθήματος',
    bookShort: 'Κράτηση',
    about: 'Σχετικά',
    subjects: 'Μαθήματα και τιμές',
    availability: 'Επόμενες διαθέσιμες ώρες',
    reviews: 'Αξιολογήσεις',
    noReviews: 'Δεν υπάρχουν ακόμη αξιολογήσεις.',
    reviewsOnlyStudents: 'Μόνο μαθητές που έχουν παρακολουθήσει μαθήματα μπορούν να αφήσουν αξιολόγηση.',
    perLesson: 'ανά μάθημα',
    minutes: 'λεπτά',
    poweredBy: 'Με την υποστήριξη του',
    selectSlot: 'Επιλέξτε ώρα',
    yourDetails: 'Τα στοιχεία σας',
    payment: 'Πληρωμή',
    fullName: 'Ονοματεπώνυμο',
    email: 'Email',
    phone: 'Τηλέφωνο (προαιρετικά)',
    continue: 'Συνέχεια',
    back: 'Πίσω',
    lessonPrice: 'Τιμή μαθήματος',
    serviceFee: 'Χρέωση υπηρεσίας',
    total: 'Σύνολο',
    payNow: 'Πληρωμή',
    prototypeNotice: 'Στο πρωτότυπο δεν εκτελείται πληρωμή. Στην πραγματική διαδικασία ανοίγει το Stripe Checkout και, μετά την επιτυχή πληρωμή, κρατείται το μάθημα και αποστέλλεται σύνδεσμος λογαριασμού μέσω email.',
    close: 'Κλείσιμο',
    reviewCount: 'αξιολογήσεις',
    languages: 'Γλώσσες',
    verified: 'Επαληθευμένο',
    selected: 'Επιλεγμένο',
    stepLesson: '1. Επιλέξτε μάθημα',
    stepTime: '2. Επιλέξτε ώρα',
    pickFormat: 'Επιλέξτε τρόπο διεξαγωγής',
    pickDate: 'Επιλέξτε ημερομηνία',
    pickTime: 'Επιλέξτε ώρα',
    duration: 'Διάρκεια',
    price: 'Τιμή',
    timeShownIn: 'Οι ώρες εμφανίζονται στη ζώνη:',
    continueBooking: 'Συνέχεια αιτήματος',
    trustLine: 'Χωρίς δέσμευση · απάντηση μέσω email',
    linkLessons: 'Μαθήματα και τιμές',
    linkAbout: 'Πώς γίνονται τα μαθήματα',
    linkReviews: 'Αξιολογήσεις μαθητών',
    bookLesson: 'Κράτηση μαθήματος',
    free: 'Δωρεάν',
    change: 'Αλλαγή',
    linkBook: 'Κράτηση ώρας',
    linkAboutMe: 'Σχετικά με εμένα',
    linkAboutUs: 'Σχετικά με εμάς',
    backToMenu: 'Πίσω',
    bookThis: 'Κράτηση',
    basedIn: 'Τοποθεσία',
    lessonsGiven: 'Βαθμολογία',
    statusDraft: 'Πρόχειρο',
    statusLive: 'Δημοσιευμένο',
    notLiveTitle: 'Αυτή η σελίδα δεν έχει δημοσιευτεί ακόμη',
    notLiveBody: 'Ο ιδιοκτήτης δεν την έχει δημοσιεύσει ακόμη. Μετά τη δημοσίευση θα είναι ορατή σε όλους.',
    loading: 'Φόρτωση…',
    notFoundTitle: 'Η σελίδα δεν βρέθηκε',
    notFoundBody: 'Αυτή η διεύθυνση δεν υπάρχει ή η σελίδα δεν είναι πλέον δημοσιευμένη.',
    enquiryIntro: 'Αφήστε τα στοιχεία σας — θα επικοινωνήσουμε μαζί σας για να επιβεβαιώσουμε την ώρα.',
    messageLabel: 'Μήνυμα (προαιρετικά)',
    sendEnquiry: 'Αποστολή αιτήματος',
    sending: 'Αποστολή…',
    enquirySentTitle: 'Το αίτημα στάλθηκε',
    enquirySentBody: 'Λάβαμε το αίτημά σας — θα επικοινωνήσουμε μέσω email ή τηλεφώνου για να επιβεβαιώσουμε την ώρα.',
    enquiryFailed: 'Δεν ήταν δυνατή η αποστολή. Δοκιμάστε ξανά.',
    enquiryTooMany: 'Πάρα πολλά διαδοχικά αιτήματα. Δοκιμάστε ξανά αργότερα.',
    noSlots: 'Δεν εμφανίζονται διαθέσιμες ώρες αυτή τη στιγμή — στείλτε αίτημα για να κανονίσουμε μία.',
    noOfferings: 'Η λίστα μαθημάτων ετοιμάζεται ακόμη.',
    yourRequest: 'Το αίτημά σας',
    anyTime: 'Οποιαδήποτε ώρα',
  },
  hu: {
    demoBanner: 'Prototípus – mintaadatok. A valódi foglalás és fizetés még nincs bekötve.',
    book: 'Óra foglalása',
    bookShort: 'Foglalás',
    about: 'Bemutatkozás',
    subjects: 'Órák és árak',
    availability: 'Következő szabad időpontok',
    reviews: 'Értékelések',
    noReviews: 'Még nincsenek értékelések.',
    reviewsOnlyStudents: 'Csak olyan diák írhat értékelést, aki már részt vett órán.',
    perLesson: 'óránként',
    minutes: 'perc',
    poweredBy: 'A szolgáltatást biztosítja:',
    selectSlot: 'Válassz időpontot',
    yourDetails: 'Adataid',
    payment: 'Fizetés',
    fullName: 'Teljes név',
    email: 'E-mail-cím',
    phone: 'Telefonszám (nem kötelező)',
    continue: 'Folytatás',
    back: 'Vissza',
    lessonPrice: 'Óra ára',
    serviceFee: 'Szolgáltatási díj',
    total: 'Összesen',
    payNow: 'Fizetés',
    prototypeNotice: 'A prototípusban nem történik fizetés. Az éles folyamatban megnyílik a Stripe Checkout; sikeres fizetés után az órát lefoglaljuk, és e-mailben elküldjük a fiók linkjét.',
    close: 'Bezárás',
    reviewCount: 'értékelés',
    languages: 'Nyelvek',
    verified: 'Ellenőrizve',
    selected: 'Kiválasztva',
    stepLesson: '1. Válassz órát',
    stepTime: '2. Válassz időpontot',
    pickFormat: 'Válassz formát',
    pickDate: 'Válassz dátumot',
    pickTime: 'Válassz időpontot',
    duration: 'Időtartam',
    price: 'Ár',
    timeShownIn: 'Az időpontok időzónája:',
    continueBooking: 'Érdeklődés folytatása',
    trustLine: 'Kötelezettség nélkül · válasz e-mailben',
    linkLessons: 'Órák és árak',
    linkAbout: 'Az órák menete',
    linkReviews: 'Diákértékelések',
    bookLesson: 'Óra foglalása',
    free: 'Ingyenes',
    change: 'Módosítás',
    linkBook: 'Időpont foglalása',
    linkAboutMe: 'Rólam',
    linkAboutUs: 'Rólunk',
    backToMenu: 'Vissza',
    bookThis: 'Foglalás',
    basedIn: 'Helyszín',
    lessonsGiven: 'Értékelés',
    statusDraft: 'Piszkozat',
    statusLive: 'Közzétéve',
    notLiveTitle: 'Ez az oldal még nincs közzétéve',
    notLiveBody: 'A tulajdonos még nem tette közzé. Közzététel után mindenki számára látható lesz.',
    loading: 'Betöltés…',
    notFoundTitle: 'Az oldal nem található',
    notFoundBody: 'Nincs ilyen cím, vagy az oldal már nincs közzétéve.',
    enquiryIntro: 'Add meg az adataidat – felvesszük veled a kapcsolatot, és megerősítjük az időpontot.',
    messageLabel: 'Üzenet (nem kötelező)',
    sendEnquiry: 'Érdeklődés küldése',
    sending: 'Küldés…',
    enquirySentTitle: 'Érdeklődés elküldve',
    enquirySentBody: 'Megkaptuk az érdeklődésedet – e-mailben vagy telefonon keresünk az időpont megerősítéséhez.',
    enquiryFailed: 'Nem sikerült elküldeni. Próbáld újra.',
    enquiryTooMany: 'Túl sok érdeklődést küldtél egymás után. Próbáld újra később.',
    noSlots: 'Jelenleg nincs megadott szabad időpont – küldj érdeklődést, és egyeztetünk egyet.',
    noOfferings: 'Az órák listája még készül.',
    yourRequest: 'Érdeklődésed',
    anyTime: 'Bármely időpont',
  },
  sk: {
    demoBanner: 'Prototyp — vzorové údaje. Skutočné rezervácie a platby zatiaľ nie sú zapojené.',
    book: 'Rezervovať hodinu',
    bookShort: 'Rezervovať',
    about: 'O mne',
    subjects: 'Hodiny a ceny',
    availability: 'Najbližšie voľné termíny',
    reviews: 'Recenzie',
    noReviews: 'Zatiaľ žiadne recenzie.',
    reviewsOnlyStudents: 'Recenziu môžu pridať len študenti, ktorí absolvovali hodiny.',
    perLesson: 'za hodinu',
    minutes: 'min',
    poweredBy: 'Používa platformu',
    selectSlot: 'Vyberte termín',
    yourDetails: 'Vaše údaje',
    payment: 'Platba',
    fullName: 'Meno a priezvisko',
    email: 'E-mail',
    phone: 'Telefón (voliteľné)',
    continue: 'Pokračovať',
    back: 'Späť',
    lessonPrice: 'Cena hodiny',
    serviceFee: 'Servisný poplatok',
    total: 'Celkom',
    payNow: 'Zaplatiť',
    prototypeNotice: 'V prototype sa platba nevykoná. V skutočnom procese sa otvorí Stripe Checkout; po úspešnej platbe sa hodina rezervuje a e-mailom sa odošle odkaz na účet.',
    close: 'Zavrieť',
    reviewCount: 'recenzie',
    languages: 'Jazyky',
    verified: 'Overené',
    selected: 'Vybrané',
    stepLesson: '1. Vyberte hodinu',
    stepTime: '2. Vyberte termín',
    pickFormat: 'Vyberte formu',
    pickDate: 'Vyberte dátum',
    pickTime: 'Vyberte čas',
    duration: 'Trvanie',
    price: 'Cena',
    timeShownIn: 'Časy sú uvedené v časovom pásme:',
    continueBooking: 'Pokračovať v žiadosti',
    trustLine: 'Bez záväzkov · odpoveď e-mailom',
    linkLessons: 'Hodiny a ceny',
    linkAbout: 'Ako prebiehajú hodiny',
    linkReviews: 'Recenzie študentov',
    bookLesson: 'Rezervovať hodinu',
    free: 'Zadarmo',
    change: 'Zmeniť',
    linkBook: 'Rezervovať termín',
    linkAboutMe: 'O mne',
    linkAboutUs: 'O nás',
    backToMenu: 'Späť',
    bookThis: 'Rezervovať',
    basedIn: 'Miesto',
    lessonsGiven: 'Hodnotenie',
    statusDraft: 'Koncept',
    statusLive: 'Zverejnené',
    notLiveTitle: 'Táto stránka ešte nie je zverejnená',
    notLiveBody: 'Vlastník ju ešte nezverejnil. Po zverejnení bude viditeľná pre všetkých.',
    loading: 'Načítava sa…',
    notFoundTitle: 'Stránka sa nenašla',
    notFoundBody: 'Táto adresa neexistuje alebo stránka už nie je zverejnená.',
    enquiryIntro: 'Zanechajte svoje údaje — ozveme sa vám a potvrdíme termín.',
    messageLabel: 'Správa (voliteľné)',
    sendEnquiry: 'Odoslať žiadosť',
    sending: 'Odosiela sa…',
    enquirySentTitle: 'Žiadosť bola odoslaná',
    enquirySentBody: 'Vašu žiadosť sme prijali — na potvrdenie termínu vás budeme kontaktovať e-mailom alebo telefonicky.',
    enquiryFailed: 'Odoslanie sa nepodarilo. Skúste to znova.',
    enquiryTooMany: 'Príliš veľa žiadostí za sebou. Skúste to neskôr.',
    noSlots: 'Momentálne nie sú uvedené voľné termíny — pošlite žiadosť a dohodneme sa.',
    noOfferings: 'Zoznam hodín sa ešte pripravuje.',
    yourRequest: 'Vaša žiadosť',
    anyTime: 'Ľubovoľný čas',
  },
  bg: {
    demoBanner: 'Прототип — примерни данни. Реалното записване и плащане все още не са свързани.',
    book: 'Записване на урок',
    bookShort: 'Записване',
    about: 'За мен',
    subjects: 'Уроци и цени',
    availability: 'Следващи свободни часове',
    reviews: 'Отзиви',
    noReviews: 'Все още няма отзиви.',
    reviewsOnlyStudents: 'Само ученици, които са посещавали уроци, могат да оставят отзив.',
    perLesson: 'на урок',
    minutes: 'мин',
    poweredBy: 'Създадено с',
    selectSlot: 'Изберете час',
    yourDetails: 'Вашите данни',
    payment: 'Плащане',
    fullName: 'Име и фамилия',
    email: 'Имейл',
    phone: 'Телефон (по желание)',
    continue: 'Продължаване',
    back: 'Назад',
    lessonPrice: 'Цена на урока',
    serviceFee: 'Такса за обслужване',
    total: 'Общо',
    payNow: 'Плащане',
    prototypeNotice: 'В прототипа не се извършва плащане. В реалния процес се отваря Stripe Checkout и при успешно плащане урокът се резервира, а връзка към акаунта се изпраща по имейл.',
    close: 'Затваряне',
    reviewCount: 'отзива',
    languages: 'Езици',
    verified: 'Потвърден',
    selected: 'Избрано',
    stepLesson: '1. Изберете урок',
    stepTime: '2. Изберете час',
    pickFormat: 'Изберете формат',
    pickDate: 'Изберете дата',
    pickTime: 'Изберете час',
    duration: 'Продължителност',
    price: 'Цена',
    timeShownIn: 'Часовете са показани в:',
    continueBooking: 'Продължаване на запитването',
    trustLine: 'Без ангажимент · отговор по имейл',
    linkLessons: 'Уроци и цени',
    linkAbout: 'Как протичат уроците',
    linkReviews: 'Отзиви от ученици',
    bookLesson: 'Записване на урок',
    free: 'Безплатно',
    change: 'Промяна',
    linkBook: 'Запазване на час',
    linkAboutMe: 'За мен',
    linkAboutUs: 'За нас',
    backToMenu: 'Назад',
    bookThis: 'Записване',
    basedIn: 'Местоположение',
    lessonsGiven: 'Оценка',
    statusDraft: 'Чернова',
    statusLive: 'Публикувана',
    notLiveTitle: 'Тази страница все още не е публикувана',
    notLiveBody: 'Собственикът все още не я е публикувал. След публикуване тя ще бъде видима за всички.',
    loading: 'Зареждане…',
    notFoundTitle: 'Страницата не е намерена',
    notFoundBody: 'Няма такъв адрес или страницата вече не е публикувана.',
    enquiryIntro: 'Оставете данните си — ще се свържем с вас и ще потвърдим часа.',
    messageLabel: 'Съобщение (по желание)',
    sendEnquiry: 'Изпращане на запитване',
    sending: 'Изпращане…',
    enquirySentTitle: 'Запитването е изпратено',
    enquirySentBody: 'Запитването ви е получено — ще се свържем с вас по имейл или телефон, за да потвърдим часа.',
    enquiryFailed: 'Изпращането е неуспешно. Моля, опитайте отново.',
    enquiryTooMany: 'Твърде много последователни запитвания. Моля, опитайте по-късно.',
    noSlots: 'В момента няма посочени свободни часове — изпратете запитване и ще уговорим час.',
    noOfferings: 'Списъкът с уроци все още се подготвя.',
    yourRequest: 'Вашето запитване',
    anyTime: 'По всяко време',
  },
  uk: {
    demoBanner: 'Прототип — приклади даних. Справжні бронювання й оплати ще не підключено.',
    book: 'Забронювати заняття', bookShort: 'Забронювати', about: 'Про мене',
    subjects: 'Заняття й ціни', availability: 'Найближчий вільний час', reviews: 'Відгуки',
    noReviews: 'Відгуків ще немає.', reviewsOnlyStudents: 'Відгук можуть залишити лише учні, які відвідали заняття.',
    perLesson: 'за заняття', minutes: 'хв', poweredBy: 'Працює на', selectSlot: 'Виберіть час',
    yourDetails: 'Ваші дані', payment: 'Оплата', fullName: 'Повне ім’я', email: 'Електронна пошта',
    phone: 'Телефон (необов’язково)', continue: 'Продовжити', back: 'Назад', lessonPrice: 'Вартість заняття',
    serviceFee: 'Сервісний збір', total: 'Разом', payNow: 'Сплатити',
    prototypeNotice: 'У прототипі оплата не проводиться. У справжньому процесі відкривається Stripe Checkout; після успішної оплати заняття бронюється, а посилання на обліковий запис надсилається електронною поштою.',
    close: 'Закрити', reviewCount: 'відгуків', languages: 'Мови', verified: 'Перевірено', selected: 'Вибрано',
    stepLesson: '1. Виберіть заняття', stepTime: '2. Виберіть час', pickFormat: 'Виберіть формат',
    pickDate: 'Виберіть дату', pickTime: 'Виберіть час', duration: 'Тривалість', price: 'Ціна',
    timeShownIn: 'Час указано для:', continueBooking: 'Продовжити запит', trustLine: 'Без зобов’язань · відповідь електронною поштою',
    linkLessons: 'Заняття й ціни', linkAbout: 'Як проходять заняття', linkReviews: 'Відгуки учнів',
    bookLesson: 'Забронювати заняття', free: 'Безкоштовно', change: 'Змінити', linkBook: 'Зарезервувати час',
    linkAboutMe: 'Про мене', linkAboutUs: 'Про нас', backToMenu: 'Назад', bookThis: 'Забронювати',
    basedIn: 'Місце проведення', lessonsGiven: 'Оцінка', statusDraft: 'Чернетка', statusLive: 'Опубліковано',
    notLiveTitle: 'Цю сторінку ще не опубліковано', notLiveBody: 'Власник ще не опублікував сторінку. Після публікації вона стане видимою для всіх.',
    loading: 'Завантажуємо…', notFoundTitle: 'Сторінку не знайдено', notFoundBody: 'Такої адреси немає або сторінку знято з публікації.',
    enquiryIntro: 'Залиште свої дані — ми зв’яжемося з вами й підтвердимо час.', messageLabel: 'Повідомлення (необов’язково)',
    sendEnquiry: 'Надіслати запит', sending: 'Надсилаємо…', enquirySentTitle: 'Запит надіслано',
    enquirySentBody: 'Ваш запит отримано. З вами зв’яжуться електронною поштою або телефоном, щоб підтвердити час.',
    enquiryFailed: 'Не вдалося надіслати. Спробуйте ще раз.', enquiryTooMany: 'Забагато запитів поспіль. Спробуйте пізніше.',
    noSlots: 'Вільного часу поки не вказано — надішліть запит, і ми його узгодимо.',
    noOfferings: 'Список занять ще готується.', yourRequest: 'Ваш запит', anyTime: 'Будь-який час',
  },
  hr: {
    demoBanner: 'Prototip — ogledni podaci. Stvarne rezervacije i plaćanja još nisu povezani.',
    book: 'Rezerviraj sat',
    bookShort: 'Rezerviraj',
    about: 'O meni',
    subjects: 'Satovi i cijene',
    availability: 'Sljedeći slobodni termini',
    reviews: 'Recenzije',
    noReviews: 'Još nema recenzija.',
    reviewsOnlyStudents: 'Recenziju mogu ostaviti samo učenici koji su pohađali satove.',
    perLesson: 'po satu',
    minutes: 'min',
    poweredBy: 'Pokreće',
    selectSlot: 'Odaberi termin',
    yourDetails: 'Tvoji podaci',
    payment: 'Plaćanje',
    fullName: 'Ime i prezime',
    email: 'E-pošta',
    phone: 'Telefon (neobavezno)',
    continue: 'Nastavi',
    back: 'Natrag',
    lessonPrice: 'Cijena sata',
    serviceFee: 'Naknada za uslugu',
    total: 'Ukupno',
    payNow: 'Plati',
    prototypeNotice: 'U prototipu se plaćanje ne izvršava. U stvarnom postupku otvara se Stripe Checkout, a nakon uspješnog plaćanja sat se rezervira i poveznica za račun šalje se e-poštom.',
    close: 'Zatvori',
    reviewCount: 'recenzija',
    languages: 'Jezici',
    verified: 'Provjereno',
    selected: 'Odabrano',
    stepLesson: '1. Odaberi sat',
    stepTime: '2. Odaberi termin',
    pickFormat: 'Odaberi način održavanja',
    pickDate: 'Odaberi datum',
    pickTime: 'Odaberi vrijeme',
    duration: 'Trajanje',
    price: 'Cijena',
    timeShownIn: 'Vremenska zona:',
    continueBooking: 'Nastavi s upitom',
    trustLine: 'Bez obveze · odgovor e-poštom',
    linkLessons: 'Satovi i cijene',
    linkAbout: 'Kako se održavaju satovi',
    linkReviews: 'Recenzije učenika',
    bookLesson: 'Rezerviraj sat',
    free: 'Besplatno',
    change: 'Promijeni',
    linkBook: 'Rezerviraj termin',
    linkAboutMe: 'O meni',
    linkAboutUs: 'O nama',
    backToMenu: 'Natrag',
    bookThis: 'Rezerviraj',
    basedIn: 'Lokacija',
    lessonsGiven: 'Ocjena',
    statusDraft: 'Nacrt',
    statusLive: 'Objavljeno',
    notLiveTitle: 'Ova stranica još nije objavljena',
    notLiveBody: 'Vlasnik je još nije objavio. Nakon objave bit će vidljiva svima.',
    loading: 'Učitavanje…',
    notFoundTitle: 'Stranica nije pronađena',
    notFoundBody: 'Ova adresa ne postoji ili stranica više nije objavljena.',
    enquiryIntro: 'Ostavi svoje podatke — javit ćemo se i potvrditi termin.',
    messageLabel: 'Poruka (neobavezno)',
    sendEnquiry: 'Pošalji upit',
    sending: 'Slanje…',
    enquirySentTitle: 'Upit je poslan',
    enquirySentBody: 'Tvoj je upit zaprimljen — javit ćemo ti se e-poštom ili telefonom radi potvrde termina.',
    enquiryFailed: 'Nije moguće poslati. Pokušaj ponovno.',
    enquiryTooMany: 'Previše uzastopnih upita. Pokušaj ponovno kasnije.',
    noSlots: 'Trenutačno nema navedenih slobodnih termina — pošalji upit pa ćemo dogovoriti termin.',
    noOfferings: 'Popis satova još je u pripremi.',
    yourRequest: 'Tvoj upit',
    anyTime: 'Bilo koji termin',
  },
  th: {
    demoBanner: 'ต้นแบบ — ข้อมูลตัวอย่าง ยังไม่ได้เชื่อมการจองและชำระเงินจริง',
    book: 'จองคาบเรียน',
    bookShort: 'จอง',
    about: 'เกี่ยวกับ',
    subjects: 'คาบเรียนและราคา',
    availability: 'เวลาว่างถัดไป',
    reviews: 'รีวิว',
    noReviews: 'ยังไม่มีรีวิว',
    reviewsOnlyStudents: 'เฉพาะนักเรียนที่เคยเรียนแล้วเท่านั้นที่เขียนรีวิวได้',
    perLesson: 'ต่อคาบ',
    minutes: 'นาที',
    poweredBy: 'ขับเคลื่อนโดย',
    selectSlot: 'เลือกเวลา',
    yourDetails: 'ข้อมูลของคุณ',
    payment: 'การชำระเงิน',
    fullName: 'ชื่อและนามสกุล',
    email: 'อีเมล',
    phone: 'โทรศัพท์ (ไม่บังคับ)',
    continue: 'ดำเนินการต่อ',
    back: 'ย้อนกลับ',
    lessonPrice: 'ราคาคาบเรียน',
    serviceFee: 'ค่าบริการ',
    total: 'รวม',
    payNow: 'ชำระเงิน',
    prototypeNotice: 'ต้นแบบจะไม่ดำเนินการชำระเงิน ในขั้นตอนจริงจะเปิด Stripe Checkout เมื่อชำระสำเร็จ ระบบจะจองคาบและส่งลิงก์บัญชีทางอีเมล',
    close: 'ปิด',
    reviewCount: 'รีวิว',
    languages: 'ภาษา',
    verified: 'ตรวจสอบแล้ว',
    selected: 'เลือกแล้ว',
    stepLesson: '1. เลือกคาบเรียน',
    stepTime: '2. เลือกเวลา',
    pickFormat: 'เลือกรูปแบบ',
    pickDate: 'เลือกวันที่',
    pickTime: 'เลือกเวลา',
    duration: 'ระยะเวลา',
    price: 'ราคา',
    timeShownIn: 'แสดงเวลาในเขตเวลา:',
    continueBooking: 'ส่งคำขอต่อ',
    trustLine: 'ไม่มีข้อผูกมัด · ตอบทางอีเมล',
    linkLessons: 'คาบเรียนและราคา',
    linkAbout: 'รูปแบบการเรียน',
    linkReviews: 'รีวิวจากนักเรียน',
    bookLesson: 'จองคาบเรียน',
    free: 'ฟรี',
    change: 'เปลี่ยน',
    linkBook: 'สำรองเวลา',
    linkAboutMe: 'เกี่ยวกับฉัน',
    linkAboutUs: 'เกี่ยวกับเรา',
    backToMenu: 'ย้อนกลับ',
    bookThis: 'จอง',
    basedIn: 'สถานที่',
    lessonsGiven: 'คะแนนรีวิว',
    statusDraft: 'ฉบับร่าง',
    statusLive: 'เผยแพร่แล้ว',
    notLiveTitle: 'หน้านี้ยังไม่เผยแพร่',
    notLiveBody: 'เจ้าของยังไม่ได้เผยแพร่หน้านี้ เมื่อเผยแพร่แล้วทุกคนจะดูได้',
    loading: 'กำลังโหลด…',
    notFoundTitle: 'ไม่พบหน้า',
    notFoundBody: 'ไม่มีที่อยู่นี้ หรือหน้านี้ไม่ได้เผยแพร่แล้ว',
    enquiryIntro: 'กรอกข้อมูลของคุณ แล้วเราจะติดต่อเพื่อยืนยันเวลา',
    messageLabel: 'ข้อความ (ไม่บังคับ)',
    sendEnquiry: 'ส่งคำขอ',
    sending: 'กำลังส่ง…',
    enquirySentTitle: 'ส่งคำขอแล้ว',
    enquirySentBody: 'ได้รับคำขอแล้ว คุณจะได้รับการติดต่อทางอีเมลหรือโทรศัพท์เพื่อยืนยันเวลา',
    enquiryFailed: 'ส่งไม่ได้ โปรดลองอีกครั้ง',
    enquiryTooMany: 'ส่งคำขอต่อเนื่องมากเกินไป โปรดลองภายหลัง',
    noSlots: 'ขณะนี้ยังไม่มีเวลาว่างที่แสดง ส่งคำขอเพื่อให้เราจัดเวลาให้ได้',
    noOfferings: 'กำลังเตรียมรายการคาบเรียน',
    yourRequest: 'คำขอของคุณ',
    anyTime: 'เวลาใดก็ได้',
  },
  tr: {
    "demoBanner": "Prototip — örnek veriler. Gerçek rezervasyon ve ödeme henüz bağlı değil.",
    "book": "Ders rezervasyonu yap",
    "bookShort": "Rezervasyon yap",
    "about": "Hakkında",
    "subjects": "Dersler ve fiyatlar",
    "availability": "En yakın müsait saatler",
    "reviews": "Değerlendirmeler",
    "noReviews": "Henüz değerlendirme yok.",
    "reviewsOnlyStudents": "Yalnızca ders almış öğrenciler değerlendirme bırakabilir.",
    "perLesson": "ders başına",
    "minutes": "dk",
    "poweredBy": "Altyapı sağlayıcısı",
    "selectSlot": "Saat seçin",
    "yourDetails": "Bilgileriniz",
    "payment": "Ödeme",
    "fullName": "Ad ve soyad",
    "email": "E-posta",
    "phone": "Telefon (isteğe bağlı)",
    "continue": "Devam et",
    "back": "Geri",
    "lessonPrice": "Ders fiyatı",
    "serviceFee": "Hizmet ücreti",
    "total": "Toplam",
    "payNow": "Öde",
    "prototypeNotice": "Prototipte ödeme yapılmaz. Gerçek akışta Stripe Checkout açılır; ödeme başarılı olunca ders ayrılır ve hesap bağlantısı e-posta ile gönderilir.",
    "close": "Kapat",
    "reviewCount": "değerlendirme",
    "languages": "Diller",
    "verified": "Doğrulandı",
    "selected": "Seçildi",
    "stepLesson": "1. Ders seçin",
    "stepTime": "2. Saat seçin",
    "pickFormat": "Format seçin",
    "pickDate": "Tarih seçin",
    "pickTime": "Saat seçin",
    "duration": "Süre",
    "price": "Fiyat",
    "timeShownIn": "Saat dilimi:",
    "continueBooking": "Talebe devam et",
    "trustLine": "Yükümlülük yok · e-posta ile yanıt",
    "linkLessons": "Dersler ve fiyatlar",
    "linkAbout": "Dersler nasıl işlenir?",
    "linkReviews": "Öğrenci değerlendirmeleri",
    "bookLesson": "Ders rezervasyonu yap",
    "free": "Ücretsiz",
    "change": "Değiştir",
    "linkBook": "Saat ayırt",
    "linkAboutMe": "Hakkımda",
    "linkAboutUs": "Hakkımızda",
    "backToMenu": "Geri",
    "bookThis": "Rezervasyon yap",
    "basedIn": "Konum",
    "lessonsGiven": "Puan",
    "statusDraft": "Taslak",
    "statusLive": "Yayında",
    "notLiveTitle": "Bu sayfa henüz yayında değil",
    "notLiveBody": "Sayfa sahibi henüz yayımlamadı. Yayımlandığında herkes tarafından görülebilir.",
    "loading": "Yükleniyor…",
    "notFoundTitle": "Sayfa bulunamadı",
    "notFoundBody": "Böyle bir adres yok veya sayfa artık yayında değil.",
    "enquiryIntro": "Bilgilerinizi bırakın; sizinle iletişime geçip saati onaylayalım.",
    "messageLabel": "Mesaj (isteğe bağlı)",
    "sendEnquiry": "Talep gönder",
    "sending": "Gönderiliyor…",
    "enquirySentTitle": "Talep gönderildi",
    "enquirySentBody": "Talebiniz alındı. Saati onaylamak için size e-posta veya telefonla ulaşılacaktır.",
    "enquiryFailed": "Gönderilemedi. Lütfen tekrar deneyin.",
    "enquiryTooMany": "Art arda çok fazla talep gönderildi. Lütfen daha sonra tekrar deneyin.",
    "noSlots": "Şu anda müsait saat listelenmiyor. Talep gönderin, birlikte ayarlayalım.",
    "noOfferings": "Ders listesi hazırlanıyor.",
    "yourRequest": "Talebiniz",
    "anyTime": "Herhangi bir zaman"
},
  'zh-hk': {
  "demoBanner": "原型示範，使用範例資料。尚未連接實際預約及付款功能。",
  "book": "預約課堂",
  "bookShort": "預約",
  "about": "簡介",
  "subjects": "課堂與價格",
  "availability": "即將開放的可預約時段",
  "reviews": "評價",
  "noReviews": "暫無評價。",
  "reviewsOnlyStudents": "只有曾上課的學生才可留下評價。",
  "perLesson": "每堂",
  "minutes": "分鐘",
  "poweredBy": "技術提供",
  "selectSlot": "選擇時間",
  "yourDetails": "你的資料",
  "payment": "付款",
  "fullName": "全名",
  "email": "電郵地址",
  "phone": "電話號碼（選填）",
  "continue": "繼續",
  "back": "返回",
  "lessonPrice": "課堂價格",
  "serviceFee": "服務費",
  "total": "總額",
  "payNow": "付款",
  "prototypeNotice": "原型不會執行付款。正式流程會開啟 Stripe Checkout；付款成功後，系統便會預約課堂，並以電郵發送帳戶連結。",
  "close": "關閉",
  "reviewCount": "則評價",
  "languages": "語言",
  "verified": "已核實",
  "selected": "已選取",
  "stepLesson": "1. 選擇課堂",
  "stepTime": "2. 選擇時間",
  "pickFormat": "選擇形式",
  "pickDate": "選擇日期",
  "pickTime": "選擇時間",
  "duration": "時長",
  "price": "價格",
  "timeShownIn": "顯示時間所用時區：",
  "continueBooking": "繼續申請",
  "trustLine": "毋須承諾 · 電郵回覆",
  "linkLessons": "課堂與價格",
  "linkAbout": "課堂安排",
  "linkReviews": "學生評價",
  "bookLesson": "預約課堂",
  "free": "免費",
  "change": "更改",
  "linkBook": "預留時間",
  "linkAboutMe": "關於我",
  "linkAboutUs": "關於我們",
  "backToMenu": "返回",
  "bookThis": "預約",
  "basedIn": "地點",
  "lessonsGiven": "評分",
  "statusDraft": "草稿",
  "statusLive": "已發佈",
  "notLiveTitle": "此頁面尚未發佈",
  "notLiveBody": "擁有人尚未發佈此頁面，發佈後所有人均可查看。",
  "loading": "正在載入…",
  "notFoundTitle": "找不到頁面",
  "notFoundBody": "此網址不存在，或頁面已取消發佈。",
  "enquiryIntro": "留下你的資料，我們會聯絡你並確認時間。",
  "messageLabel": "訊息（選填）",
  "sendEnquiry": "提交申請",
  "sending": "正在發送…",
  "enquirySentTitle": "申請已提交",
  "enquirySentBody": "已收到你的申請，我們會透過電郵或電話聯絡你以確認時間。",
  "enquiryFailed": "無法發送，請再試一次。",
  "enquiryTooMany": "短時間內提交太多申請，請稍後再試。",
  "noSlots": "目前沒有列出的可預約時段，請提交申請，我們會另作安排。",
  "noOfferings": "課堂清單仍在準備中。",
  "yourRequest": "你的申請",
  "anyTime": "任何時間"
},
  fil: {
    "demoBanner": "Prototype — halimbawang datos. Hindi pa nakakonekta ang aktuwal na pag-book at pagbabayad.",
    "book": "Mag-book ng sesyon",
    "bookShort": "Mag-book",
    "about": "Tungkol sa",
    "subjects": "Mga sesyon at presyo",
    "availability": "Susunod na mga bakanteng oras",
    "reviews": "Mga review",
    "noReviews": "Wala pang review.",
    "reviewsOnlyStudents": "Mga estudyanteng nakadalo na sa mga sesyon lang ang maaaring mag-iwan ng review.",
    "perLesson": "bawat sesyon",
    "minutes": "min",
    "poweredBy": "Pinapagana ng",
    "selectSlot": "Pumili ng oras",
    "yourDetails": "Ang iyong mga detalye",
    "payment": "Bayad",
    "fullName": "Buong pangalan",
    "email": "Email",
    "phone": "Telepono (opsyonal)",
    "continue": "Magpatuloy",
    "back": "Bumalik",
    "lessonPrice": "Presyo ng sesyon",
    "serviceFee": "Bayarin sa serbisyo",
    "total": "Kabuuan",
    "payNow": "Magbayad",
    "prototypeNotice": "Walang aktuwal na pagbabayad sa prototype. Sa totoong proseso, bubuksan nito ang Stripe Checkout, at kapag matagumpay ang bayad, ibu-book ang sesyon at mag-e-email ng link sa account.",
    "close": "Isara",
    "reviewCount": "review",
    "languages": "Mga wika",
    "verified": "Na-verify",
    "selected": "Napili",
    "stepLesson": "1. Pumili ng sesyon",
    "stepTime": "2. Pumili ng oras",
    "pickFormat": "Pumili ng format",
    "pickDate": "Pumili ng petsa",
    "pickTime": "Pumili ng oras",
    "duration": "Tagal",
    "price": "Presyo",
    "timeShownIn": "Mga oras na ipinapakita sa:",
    "continueBooking": "Ipagpatuloy ang kahilingan",
    "trustLine": "Walang obligasyon · tugon sa email",
    "linkLessons": "Mga sesyon at presyo",
    "linkAbout": "Paano gumagana ang mga sesyon",
    "linkReviews": "Mga review ng estudyante",
    "bookLesson": "Mag-book ng sesyon",
    "free": "Libre",
    "change": "Palitan",
    "linkBook": "Magreserba ng oras",
    "linkAboutMe": "Tungkol sa akin",
    "linkAboutUs": "Tungkol sa amin",
    "backToMenu": "Bumalik",
    "bookThis": "Mag-book",
    "basedIn": "Lokasyon",
    "lessonsGiven": "Rating",
    "statusDraft": "Draft",
    "statusLive": "Nakapublish",
    "notLiveTitle": "Hindi pa nakapublish ang pahinang ito",
    "notLiveBody": "Hindi pa ito nailalathala ng may-ari. Kapag nailathala na, makikita na ito ng lahat.",
    "loading": "Nilo-load…",
    "notFoundTitle": "Hindi mahanap ang pahina",
    "notFoundBody": "Walang ganitong address, o hindi na nakapublish ang pahina.",
    "enquiryIntro": "Iwan ang iyong mga detalye — makikipag-ugnayan kami at kukumpirmahin ang oras.",
    "messageLabel": "Mensahe (opsyonal)",
    "sendEnquiry": "Ipadala ang kahilingan",
    "sending": "Ipinapadala…",
    "enquirySentTitle": "Naipadala ang kahilingan",
    "enquirySentBody": "Natanggap ang iyong kahilingan — kokontakin ka sa email o telepono para kumpirmahin ang oras.",
    "enquiryFailed": "Hindi maipadala. Subukang muli.",
    "enquiryTooMany": "Masyadong maraming sunod-sunod na kahilingan. Subukang muli mamaya.",
    "noSlots": "Walang nakalistang bakanteng oras ngayon — magpadala ng kahilingan at mag-aayos tayo ng oras.",
    "noOfferings": "Inihahanda pa ang listahan ng sesyon.",
    "yourRequest": "Ang iyong kahilingan",
    "anyTime": "Anumang oras"
},
  ja: {
    demoBanner: 'サンプルデータを使った試作版です。実際の予約と決済はまだ接続されていません。',
    book: 'レッスンを予約',
    bookShort: '予約',
    about: '紹介',
    subjects: 'レッスンと料金',
    availability: '直近の空き時間',
    reviews: '口コミ',
    noReviews: '口コミはまだありません。',
    reviewsOnlyStudents: 'レッスンを受けた受講者のみ口コミを投稿できます。',
    perLesson: 'レッスンあたり',
    minutes: '分',
    poweredBy: '提供：',
    selectSlot: '時間を選択',
    yourDetails: '連絡先情報',
    payment: '支払い',
    fullName: '氏名',
    email: 'メールアドレス',
    phone: '電話番号（任意）',
    continue: '次へ',
    back: '戻る',
    lessonPrice: 'レッスン料金',
    serviceFee: 'サービス手数料',
    total: '合計',
    payNow: '支払う',
    prototypeNotice: '試作版では決済は行われません。実際の手続きではStripe Checkoutが開き、支払い完了後にレッスンが予約され、アカウント用のリンクがメールで届きます。',
    close: '閉じる',
    reviewCount: '件の口コミ',
    languages: '使用言語',
    verified: '確認済み',
    selected: '選択中',
    stepLesson: '1. レッスンを選択',
    stepTime: '2. 時間を選択',
    pickFormat: '形式を選択',
    pickDate: '日付を選択',
    pickTime: '時間を選択',
    duration: '時間',
    price: '料金',
    timeShownIn: '表示タイムゾーン：',
    continueBooking: '問い合わせを続ける',
    trustLine: '契約義務なし · メールで回答',
    linkLessons: 'レッスンと料金',
    linkAbout: 'レッスンの進め方',
    linkReviews: '受講者の口コミ',
    bookLesson: 'レッスンを予約',
    free: '無料',
    change: '変更',
    linkBook: '時間を予約',
    linkAboutMe: '自己紹介',
    linkAboutUs: '私たちについて',
    backToMenu: '戻る',
    bookThis: '予約',
    basedIn: '所在地',
    lessonsGiven: '評価',
    statusDraft: '下書き',
    statusLive: '公開中',
    notLiveTitle: 'このページはまだ公開されていません',
    notLiveBody: 'オーナーがまだ公開していません。公開後はどなたでも閲覧できるようになります。',
    loading: '読み込み中…',
    notFoundTitle: 'ページが見つかりません',
    notFoundBody: 'このアドレスは存在しないか、ページの公開が終了しています。',
    enquiryIntro: '連絡先を入力してください。ご連絡のうえ、日時を確定します。',
    messageLabel: 'メッセージ（任意）',
    sendEnquiry: '問い合わせを送信',
    sending: '送信中…',
    enquirySentTitle: '問い合わせを送信しました',
    enquirySentBody: 'お問い合わせを受け付けました。日時の確定について、メールまたは電話でご連絡します。',
    enquiryFailed: '送信できませんでした。もう一度お試しください。',
    enquiryTooMany: 'お問い合わせが短時間に多く送信されています。しばらくしてからお試しください。',
    noSlots: '現在、空き時間は表示されていません。お問い合わせいただければ調整します。',
    noOfferings: 'レッスン一覧は準備中です。',
    yourRequest: 'お問い合わせ内容',
    anyTime: 'いつでも',
  },
  hi: {
    demoBanner: 'प्रोटोटाइप — उदाहरण डेटा। असली बुकिंग और भुगतान अभी जुड़े नहीं हैं।',
    book: 'क्लास बुक करें',
    bookShort: 'बुक करें',
    about: 'परिचय',
    subjects: 'क्लास और कीमतें',
    availability: 'अगले उपलब्ध समय',
    reviews: 'समीक्षाएँ',
    noReviews: 'अभी कोई समीक्षा नहीं है।',
    reviewsOnlyStudents: 'सिर्फ़ क्लास ले चुके विद्यार्थी समीक्षा दे सकते हैं।',
    perLesson: 'प्रति क्लास',
    minutes: 'मिनट',
    poweredBy: 'इनकी मदद से',
    selectSlot: 'समय चुनें',
    yourDetails: 'आपका विवरण',
    payment: 'भुगतान',
    fullName: 'पूरा नाम',
    email: 'ईमेल',
    phone: 'फ़ोन (वैकल्पिक)',
    continue: 'आगे बढ़ें',
    back: 'वापस',
    lessonPrice: 'क्लास की कीमत',
    serviceFee: 'सेवा शुल्क',
    total: 'कुल',
    payNow: 'भुगतान करें',
    prototypeNotice: 'प्रोटोटाइप में भुगतान नहीं होता। असली प्रक्रिया में Stripe Checkout खुलता है। सफल भुगतान के बाद क्लास बुक हो जाती है और खाते का लिंक ईमेल से भेजा जाता है।',
    close: 'बंद करें',
    reviewCount: 'समीक्षाएँ',
    languages: 'भाषाएँ',
    verified: 'सत्यापित',
    selected: 'चुना गया',
    stepLesson: '1. क्लास चुनें',
    stepTime: '2. समय चुनें',
    pickFormat: 'माध्यम चुनें',
    pickDate: 'तारीख चुनें',
    pickTime: 'समय चुनें',
    duration: 'अवधि',
    price: 'कीमत',
    timeShownIn: 'समय इस समय-क्षेत्र में है:',
    continueBooking: 'अनुरोध जारी रखें',
    trustLine: 'कोई बाध्यता नहीं · ईमेल से जवाब',
    linkLessons: 'क्लास और कीमतें',
    linkAbout: 'क्लास कैसे होती हैं',
    linkReviews: 'विद्यार्थियों की समीक्षाएँ',
    bookLesson: 'क्लास बुक करें',
    free: 'मुफ़्त',
    change: 'बदलें',
    linkBook: 'समय आरक्षित करें',
    linkAboutMe: 'मेरे बारे में',
    linkAboutUs: 'हमारे बारे में',
    backToMenu: 'वापस',
    bookThis: 'बुक करें',
    basedIn: 'स्थान',
    lessonsGiven: 'रेटिंग',
    statusDraft: 'ड्राफ़्ट',
    statusLive: 'प्रकाशित',
    notLiveTitle: 'यह पेज अभी प्रकाशित नहीं है',
    notLiveBody: 'मालिक ने इसे अभी प्रकाशित नहीं किया है। प्रकाशित होने के बाद यह सभी को दिखाई देगा।',
    loading: 'लोड हो रहा है…',
    notFoundTitle: 'पेज नहीं मिला',
    notFoundBody: 'यह पता मौजूद नहीं है या पेज अब प्रकाशित नहीं है।',
    enquiryIntro: 'अपना विवरण दें — हम संपर्क करके समय की पुष्टि करेंगे।',
    messageLabel: 'संदेश (वैकल्पिक)',
    sendEnquiry: 'अनुरोध भेजें',
    sending: 'भेजा जा रहा है…',
    enquirySentTitle: 'अनुरोध भेज दिया गया',
    enquirySentBody: 'आपका अनुरोध मिल गया है — समय की पुष्टि के लिए ईमेल या फ़ोन से आपसे संपर्क किया जाएगा।',
    enquiryFailed: 'भेजा नहीं जा सका। कृपया फिर कोशिश करें।',
    enquiryTooMany: 'लगातार बहुत सारे अनुरोध भेजे गए हैं। कृपया बाद में कोशिश करें।',
    noSlots: 'अभी कोई खाली समय सूची में नहीं है — अनुरोध भेजें, हम समय तय करेंगे।',
    noOfferings: 'क्लास की सूची अभी तैयार हो रही है।',
    yourRequest: 'आपका अनुरोध',
    anyTime: 'कोई भी समय',
  },
  ko: {
    demoBanner: '프로토타입 — 예시 데이터입니다. 실제 예약과 결제는 아직 연결되지 않았습니다.',
    book: '수업 예약',
    bookShort: '예약',
    about: '소개',
    subjects: '수업 및 수업료',
    availability: '가장 가까운 예약 가능 시간',
    reviews: '후기',
    noReviews: '아직 후기가 없습니다.',
    reviewsOnlyStudents: '수업을 받은 학생만 후기를 남길 수 있습니다.',
    perLesson: '수업당',
    minutes: '분',
    poweredBy: '제공',
    selectSlot: '시간 선택',
    yourDetails: '내 정보',
    payment: '결제',
    fullName: '성명',
    email: '이메일',
    phone: '전화번호 (선택 사항)',
    continue: '계속',
    back: '뒤로',
    lessonPrice: '수업료',
    serviceFee: '서비스 수수료',
    total: '합계',
    payNow: '결제',
    prototypeNotice: '프로토타입에서는 결제가 실행되지 않습니다. 실제 과정에서는 Stripe Checkout이 열리며, 결제 완료 후 수업이 예약되고 계정 링크가 이메일로 발송됩니다.',
    close: '닫기',
    reviewCount: '후기',
    languages: '언어',
    verified: '인증됨',
    selected: '선택됨',
    stepLesson: '1. 수업 선택',
    stepTime: '2. 시간 선택',
    pickFormat: '진행 방식 선택',
    pickDate: '날짜 선택',
    pickTime: '시간 선택',
    duration: '수업 시간',
    price: '수업료',
    timeShownIn: '표시 시간대:',
    continueBooking: '문의 계속하기',
    trustLine: '신청 의무 없음 · 이메일로 답변',
    linkLessons: '수업 및 수업료',
    linkAbout: '수업 진행 방식',
    linkReviews: '학생 후기',
    bookLesson: '수업 예약',
    free: '무료',
    change: '변경',
    linkBook: '시간 예약',
    linkAboutMe: '튜터 소개',
    linkAboutUs: '기관 소개',
    backToMenu: '뒤로',
    bookThis: '예약',
    basedIn: '위치',
    lessonsGiven: '평점',
    statusDraft: '초안',
    statusLive: '공개됨',
    notLiveTitle: '아직 공개되지 않은 페이지입니다',
    notLiveBody: '소유자가 아직 페이지를 공개하지 않았습니다. 공개하면 누구나 볼 수 있습니다.',
    loading: '불러오는 중…',
    notFoundTitle: '페이지를 찾을 수 없습니다',
    notFoundBody: '존재하지 않는 주소이거나 더 이상 공개되지 않는 페이지입니다.',
    enquiryIntro: '연락처를 남겨 주세요. 연락드려 시간을 확정하겠습니다.',
    messageLabel: '메시지 (선택 사항)',
    sendEnquiry: '문의 보내기',
    sending: '발송 중…',
    enquirySentTitle: '문의가 발송되었습니다',
    enquirySentBody: '문의가 접수되었습니다. 시간을 확정하기 위해 이메일이나 전화로 연락드립니다.',
    enquiryFailed: '발송하지 못했습니다. 다시 시도하세요.',
    enquiryTooMany: '연속으로 너무 많은 문의를 보냈습니다. 나중에 다시 시도하세요.',
    noSlots: '현재 등록된 수업 가능 시간이 없습니다. 문의를 보내주시면 시간을 조율하겠습니다.',
    noOfferings: '수업 목록을 준비 중입니다.',
    yourRequest: '내 문의',
    anyTime: '모든 시간',
  },
  id: {
    demoBanner: 'Prototipe — data contoh. Pemesanan dan pembayaran sungguhan belum terhubung.',
    book: 'Pesan sesi les',
    bookShort: 'Pesan',
    about: 'Tentang',
    subjects: 'Sesi les dan harga',
    availability: 'Waktu tersedia berikutnya',
    reviews: 'Ulasan',
    noReviews: 'Belum ada ulasan.',
    reviewsOnlyStudents: 'Hanya siswa yang pernah mengikuti sesi les yang dapat memberikan ulasan.',
    perLesson: 'per sesi les',
    minutes: 'menit',
    poweredBy: 'Didukung oleh',
    selectSlot: 'Pilih waktu',
    yourDetails: 'Data Anda',
    payment: 'Pembayaran',
    fullName: 'Nama lengkap',
    email: 'Email',
    phone: 'Telepon (opsional)',
    continue: 'Lanjutkan',
    back: 'Kembali',
    lessonPrice: 'Harga sesi les',
    serviceFee: 'Biaya layanan',
    total: 'Total',
    payNow: 'Bayar',
    prototypeNotice: 'Pembayaran tidak dijalankan dalam prototipe. Pada alur sebenarnya, Stripe Checkout akan terbuka. Setelah pembayaran berhasil, sesi les dipesan dan tautan akun dikirim melalui email.',
    close: 'Tutup',
    reviewCount: 'ulasan',
    languages: 'Bahasa',
    verified: 'Terverifikasi',
    selected: 'Dipilih',
    stepLesson: '1. Pilih sesi les',
    stepTime: '2. Pilih waktu',
    pickFormat: 'Pilih format',
    pickDate: 'Pilih tanggal',
    pickTime: 'Pilih waktu',
    duration: 'Durasi',
    price: 'Harga',
    timeShownIn: 'Waktu ditampilkan dalam:',
    continueBooking: 'Lanjutkan permintaan',
    trustLine: 'Tanpa komitmen · balasan melalui email',
    linkLessons: 'Sesi les dan harga',
    linkAbout: 'Cara belajar',
    linkReviews: 'Ulasan siswa',
    bookLesson: 'Pesan sesi les',
    free: 'Gratis',
    change: 'Ubah',
    linkBook: 'Pesan waktu',
    linkAboutMe: 'Tentang saya',
    linkAboutUs: 'Tentang kami',
    backToMenu: 'Kembali',
    bookThis: 'Pesan',
    basedIn: 'Lokasi',
    lessonsGiven: 'Penilaian',
    statusDraft: 'Draf',
    statusLive: 'Dipublikasikan',
    notLiveTitle: 'Halaman ini belum dipublikasikan',
    notLiveBody: 'Pemilik belum memublikasikannya. Setelah dipublikasikan, halaman dapat dilihat semua orang.',
    loading: 'Memuat…',
    notFoundTitle: 'Halaman tidak ditemukan',
    notFoundBody: 'Alamat ini tidak ada atau halaman tidak lagi dipublikasikan.',
    enquiryIntro: 'Tinggalkan data kontak Anda — kami akan menghubungi Anda dan mengonfirmasi waktunya.',
    messageLabel: 'Pesan (opsional)',
    sendEnquiry: 'Kirim permintaan',
    sending: 'Mengirim…',
    enquirySentTitle: 'Permintaan terkirim',
    enquirySentBody: 'Permintaan Anda telah diterima — Anda akan dihubungi melalui email atau telepon untuk mengonfirmasi waktu.',
    enquiryFailed: 'Tidak dapat mengirim. Silakan coba lagi.',
    enquiryTooMany: 'Terlalu banyak permintaan berturut-turut. Silakan coba lagi nanti.',
    noSlots: 'Saat ini belum ada waktu tersedia — kirim permintaan dan kami akan mengatur waktunya.',
    noOfferings: 'Daftar sesi les masih disiapkan.',
    yourRequest: 'Permintaan Anda',
    anyTime: 'Kapan saja',
  },
  ar: {
    "demoBanner": "نموذج أولي — بيانات تجريبية. لم يُربط الحجز والدفع الفعليان بعد.",
    "book": "احجز درسًا",
    "bookShort": "حجز",
    "about": "نبذة",
    "subjects": "الدروس والأسعار",
    "availability": "المواعيد المتاحة القادمة",
    "reviews": "التقييمات",
    "noReviews": "لا توجد تقييمات بعد.",
    "reviewsOnlyStudents": "يمكن فقط للطلاب الذين تلقّوا دروسًا كتابة تقييم.",
    "perLesson": "لكل درس",
    "minutes": "دقيقة",
    "poweredBy": "بدعم من",
    "selectSlot": "اختر موعدًا",
    "yourDetails": "بياناتك",
    "payment": "الدفع",
    "fullName": "الاسم الكامل",
    "email": "البريد الإلكتروني",
    "phone": "الهاتف (اختياري)",
    "continue": "متابعة",
    "back": "رجوع",
    "lessonPrice": "سعر الدرس",
    "serviceFee": "رسوم الخدمة",
    "total": "الإجمالي",
    "payNow": "دفع",
    "prototypeNotice": "لا يُنفّذ الدفع في النموذج الأولي. في المسار الفعلي، يفتح هذا الإجراء Stripe Checkout، وعند نجاح الدفع يُحجز الدرس ويُرسل رابط الحساب بالبريد الإلكتروني.",
    "close": "إغلاق",
    "reviewCount": "تقييمات",
    "languages": "اللغات",
    "verified": "موثّق",
    "selected": "محدّد",
    "stepLesson": "1. اختر درسًا",
    "stepTime": "2. اختر موعدًا",
    "pickFormat": "اختر طريقة إقامة الدرس",
    "pickDate": "اختر تاريخًا",
    "pickTime": "اختر وقتًا",
    "duration": "المدة",
    "price": "السعر",
    "timeShownIn": "تُعرض الأوقات حسب:",
    "continueBooking": "متابعة الاستفسار",
    "trustLine": "دون التزام · الرد بالبريد الإلكتروني",
    "linkLessons": "الدروس والأسعار",
    "linkAbout": "كيف تُقدّم الدروس",
    "linkReviews": "تقييمات الطلاب",
    "bookLesson": "احجز درسًا",
    "free": "مجاني",
    "change": "تغيير",
    "linkBook": "احجز موعدًا",
    "linkAboutMe": "نبذة عني",
    "linkAboutUs": "نبذة عنا",
    "backToMenu": "رجوع",
    "bookThis": "حجز",
    "basedIn": "الموقع",
    "lessonsGiven": "التقييم",
    "statusDraft": "مسودة",
    "statusLive": "منشورة",
    "notLiveTitle": "لم تُنشر هذه الصفحة بعد",
    "notLiveBody": "لم ينشرها صاحبها بعد. عند نشرها، ستصبح مرئية للجميع.",
    "loading": "جارٍ التحميل…",
    "notFoundTitle": "الصفحة غير موجودة",
    "notFoundBody": "هذا العنوان غير موجود أو لم تعد الصفحة منشورة.",
    "enquiryIntro": "اترك بياناتك — سنتواصل معك لتأكيد الموعد.",
    "messageLabel": "الرسالة (اختياري)",
    "sendEnquiry": "إرسال الاستفسار",
    "sending": "جارٍ الإرسال…",
    "enquirySentTitle": "أُرسل الاستفسار",
    "enquirySentBody": "استُلم استفسارك — سيتم التواصل معك بالبريد الإلكتروني أو الهاتف لتأكيد الموعد.",
    "enquiryFailed": "تعذّر الإرسال. يرجى المحاولة مجددًا.",
    "enquiryTooMany": "أُرسلت استفسارات كثيرة متتالية. يرجى المحاولة لاحقًا.",
    "noSlots": "لا توجد أوقات متاحة معروضة حاليًا — أرسل استفسارًا لنرتّب موعدًا.",
    "noOfferings": "قائمة الدروس ما زالت قيد الإعداد.",
    "yourRequest": "استفسارك",
    "anyTime": "أي وقت"
},
  lt: {
    demoBanner: 'Prototipas — pavyzdiniai duomenys, tikra rezervacija ir apmokėjimas dar nepajungti.',
    book: 'Rezervuoti pamoką',
    bookShort: 'Rezervuoti',
    about: 'Apie',
    subjects: 'Pamokos ir kainos',
    availability: 'Artimiausi laisvi laikai',
    reviews: 'Atsiliepimai',
    noReviews: 'Kol kas atsiliepimų nėra.',
    reviewsOnlyStudents: 'Atsiliepimus gali palikti tik mokiniai, turėję pamokų.',
    perLesson: 'už pamoką',
    minutes: 'min.',
    poweredBy: 'Veikia su',
    selectSlot: 'Pasirinkite laiką',
    yourDetails: 'Jūsų duomenys',
    payment: 'Apmokėjimas',
    fullName: 'Vardas, pavardė',
    email: 'El. paštas',
    phone: 'Telefonas (nebūtina)',
    continue: 'Tęsti',
    back: 'Atgal',
    lessonPrice: 'Pamokos kaina',
    serviceFee: 'Aptarnavimo mokestis',
    total: 'Iš viso',
    payNow: 'Apmokėti',
    prototypeNotice: 'Prototipe apmokėjimas nevykdomas. Realiame sraute čia atsidarytų Stripe Checkout, o po sėkmingo mokėjimo pamoka būtų užrezervuota ir atsiųstas prisijungimo laiškas.',
    close: 'Uždaryti',
    reviewCount: 'atsiliepimai',
    languages: 'Kalbos',
    verified: 'Patvirtinta',
    selected: 'Pasirinkta',
    stepLesson: '1. Pasirink pamoką',
    stepTime: '2. Pasirink laiką',
    pickFormat: 'Pasirinkite formatą',
    pickDate: 'Pasirinkite datą',
    pickTime: 'Pasirinkite laiką',
    duration: 'Trukmė',
    price: 'Kaina',
    timeShownIn: 'Laikas rodomas:',
    continueBooking: 'Tęsti užklausą',
    trustLine: 'Be įsipareigojimo · atsakymas el. paštu',
    linkLessons: 'Pamokų tipai ir kainos',
    linkAbout: 'Kaip mokomės',
    linkReviews: 'Mokinių atsiliepimai',
    bookLesson: 'Rezervuoti pamoką',
    free: 'Nemokama',
    change: 'Keisti',
    linkBook: 'Rezervuoti laiką',
    linkAboutMe: 'Apie mane',
    linkAboutUs: 'Apie mus',
    backToMenu: 'Atgal',
    bookThis: 'Rezervuoti',
    basedIn: 'Vieta',
    lessonsGiven: 'Įvertinimas',
    statusDraft: 'Juodraštis',
    statusLive: 'Paskelbta',
    notLiveTitle: 'Šis puslapis dar nepaskelbtas',
    notLiveBody: 'Savininkas dar nepaspaudė „Paskelbti“. Kai puslapis bus paskelbtas, jis taps matomas visiems.',
    loading: 'Kraunama…',
    notFoundTitle: 'Puslapis nerastas',
    notFoundBody: 'Tokio adreso nėra arba puslapis nebeskelbiamas.',
    enquiryIntro: 'Palikite kontaktus — susisieksime ir patvirtinsime laiką.',
    messageLabel: 'Žinutė (nebūtina)',
    sendEnquiry: 'Siųsti užklausą',
    sending: 'Siunčiama…',
    enquirySentTitle: 'Užklausa išsiųsta',
    enquirySentBody: 'Užklausa gauta — su jumis susisieks el. paštu arba telefonu ir patvirtins laiką.',
    enquiryFailed: 'Nepavyko išsiųsti. Bandykite dar kartą.',
    enquiryTooMany: 'Per daug užklausų iš eilės. Pabandykite vėliau.',
    noSlots: 'Laisvų laikų šiuo metu nėra — parašykite užklausą ir suderinsime individualiai.',
    noOfferings: 'Pamokų sąrašas dar ruošiamas.',
    yourRequest: 'Jūsų užklausa',
    anyTime: 'Bet kuris laikas',
  },
  en: {
    demoBanner: 'Prototype — sample data. Real booking and payment are not wired up yet.',
    book: 'Book a lesson',
    bookShort: 'Book',
    about: 'About',
    subjects: 'Lessons and pricing',
    availability: 'Next available times',
    reviews: 'Reviews',
    noReviews: 'No reviews yet.',
    reviewsOnlyStudents: 'Only students who have had lessons can leave a review.',
    perLesson: 'per lesson',
    minutes: 'min',
    poweredBy: 'Powered by',
    selectSlot: 'Pick a time',
    yourDetails: 'Your details',
    payment: 'Payment',
    fullName: 'Full name',
    email: 'Email',
    phone: 'Phone (optional)',
    continue: 'Continue',
    back: 'Back',
    lessonPrice: 'Lesson price',
    serviceFee: 'Service fee',
    total: 'Total',
    payNow: 'Pay',
    prototypeNotice: 'Payment is not executed in the prototype. In the real flow this opens Stripe Checkout, and on success the lesson is booked and an account link is emailed.',
    close: 'Close',
    reviewCount: 'reviews',
    languages: 'Languages',
    verified: 'Verified',
    selected: 'Selected',
    stepLesson: '1. Pick a lesson',
    stepTime: '2. Pick a time',
    pickFormat: 'Choose format',
    pickDate: 'Choose a date',
    pickTime: 'Choose a time',
    duration: 'Duration',
    price: 'Price',
    timeShownIn: 'Times shown in:',
    continueBooking: 'Continue enquiry',
    trustLine: 'No commitment · reply by email',
    linkLessons: 'Lessons and pricing',
    linkAbout: 'How lessons work',
    linkReviews: 'Student reviews',
    bookLesson: 'Book a lesson',
    free: 'Free',
    change: 'Change',
    linkBook: 'Reserve a time',
    linkAboutMe: 'About me',
    linkAboutUs: 'About us',
    backToMenu: 'Back',
    bookThis: 'Book',
    basedIn: 'Location',
    lessonsGiven: 'Rating',
    statusDraft: 'Draft',
    statusLive: 'Live',
    notLiveTitle: 'This page is not live yet',
    notLiveBody: 'The owner has not published it yet. Once published it becomes visible to everyone.',
    loading: 'Loading…',
    notFoundTitle: 'Page not found',
    notFoundBody: 'There is no such address, or the page is no longer published.',
    enquiryIntro: 'Leave your details — we will get in touch and confirm the time.',
    messageLabel: 'Message (optional)',
    sendEnquiry: 'Send enquiry',
    sending: 'Sending…',
    enquirySentTitle: 'Enquiry sent',
    enquirySentBody: 'Your enquiry has been received — you will be contacted by email or phone to confirm the time.',
    enquiryFailed: 'Could not send. Please try again.',
    enquiryTooMany: 'Too many enquiries in a row. Please try again later.',
    noSlots: 'No free times listed right now — send an enquiry and we will arrange one.',
    noOfferings: 'The lesson list is still being prepared.',
    yourRequest: 'Your enquiry',
    anyTime: 'Any time',
  },
  he: {
    demoBanner: 'אב־טיפוס — נתונים לדוגמה. הזמנה ותשלום אמיתיים עדיין אינם מחוברים.',
    book: 'הזמנת שיעור',
    bookShort: 'הזמנה',
    about: 'אודות',
    subjects: 'שיעורים ומחירים',
    availability: 'המועדים הפנויים הבאים',
    reviews: 'ביקורות',
    noReviews: 'עדיין אין ביקורות.',
    reviewsOnlyStudents: 'רק תלמידים שהשתתפו בשיעורים יכולים לכתוב ביקורת.',
    perLesson: 'לשיעור',
    minutes: 'דק׳',
    poweredBy: 'מופעל באמצעות',
    selectSlot: 'בחירת מועד',
    yourDetails: 'הפרטים שלך',
    payment: 'תשלום',
    fullName: 'שם מלא',
    email: 'אימייל',
    phone: 'טלפון (אופציונלי)',
    continue: 'המשך',
    back: 'חזרה',
    lessonPrice: 'מחיר השיעור',
    serviceFee: 'דמי שירות',
    total: 'סה״כ',
    payNow: 'תשלום',
    prototypeNotice: 'באב־הטיפוס לא מתבצע תשלום. בתהליך האמיתי נפתח Stripe Checkout, ולאחר תשלום מוצלח השיעור מוזמן ונשלח באימייל קישור לחשבון.',
    close: 'סגירה',
    reviewCount: 'ביקורות',
    languages: 'שפות',
    verified: 'מאומת',
    selected: 'נבחר',
    stepLesson: '1. בחירת שיעור',
    stepTime: '2. בחירת מועד',
    pickFormat: 'בחירת סוג שיעור',
    pickDate: 'בחירת תאריך',
    pickTime: 'בחירת שעה',
    duration: 'משך',
    price: 'מחיר',
    timeShownIn: 'השעות מוצגות לפי:',
    continueBooking: 'המשך הפנייה',
    trustLine: 'ללא התחייבות · תשובה באימייל',
    linkLessons: 'שיעורים ומחירים',
    linkAbout: 'איך מתנהלים השיעורים',
    linkReviews: 'ביקורות תלמידים',
    bookLesson: 'הזמנת שיעור',
    free: 'חינם',
    change: 'שינוי',
    linkBook: 'שמירת מועד',
    linkAboutMe: 'אודותיי',
    linkAboutUs: 'אודותינו',
    backToMenu: 'חזרה',
    bookThis: 'הזמנה',
    basedIn: 'מיקום',
    lessonsGiven: 'דירוג',
    statusDraft: 'טיוטה',
    statusLive: 'פורסם',
    notLiveTitle: 'העמוד הזה עדיין לא פורסם',
    notLiveBody: 'בעל העמוד עדיין לא פרסם אותו. לאחר הפרסום הוא יהיה גלוי לכולם.',
    loading: 'טעינה…',
    notFoundTitle: 'העמוד לא נמצא',
    notFoundBody: 'הכתובת אינה קיימת או שהעמוד כבר אינו מפורסם.',
    enquiryIntro: 'השאירו פרטים — ניצור קשר ונאשר את המועד.',
    messageLabel: 'הודעה (אופציונלי)',
    sendEnquiry: 'שליחת פנייה',
    sending: 'הפנייה נשלחת…',
    enquirySentTitle: 'הפנייה נשלחה',
    enquirySentBody: 'הפנייה התקבלה — ייצרו איתך קשר באימייל או בטלפון כדי לאשר את המועד.',
    enquiryFailed: 'לא ניתן לשלוח. יש לנסות שוב.',
    enquiryTooMany: 'יותר מדי פניות ברצף. יש לנסות שוב מאוחר יותר.',
    noSlots: 'כרגע אין מועדים פנויים ברשימה — אפשר לשלוח פנייה ונתאם מועד.',
    noOfferings: 'רשימת השיעורים עדיין בהכנה.',
    yourRequest: 'הפנייה שלך',
    anyTime: 'כל מועד',
  },
  pt: {
    demoBanner: 'Protótipo — dados de exemplo. A marcação e o pagamento reais ainda não estão ligados.',
    book: 'Marcar uma aula',
    bookShort: 'Marcar',
    about: 'Sobre',
    subjects: 'Aulas e preços',
    availability: 'Próximos horários disponíveis',
    reviews: 'Avaliações',
    noReviews: 'Ainda não existem avaliações.',
    reviewsOnlyStudents: 'Só os alunos que já tiveram aulas podem deixar uma avaliação.',
    perLesson: 'por aula',
    minutes: 'min',
    poweredBy: 'Desenvolvido por',
    selectSlot: 'Escolha um horário',
    yourDetails: 'Os seus dados',
    payment: 'Pagamento',
    fullName: 'Nome completo',
    email: 'Email',
    phone: 'Telefone (opcional)',
    continue: 'Continuar',
    back: 'Voltar',
    lessonPrice: 'Preço da aula',
    serviceFee: 'Taxa de serviço',
    total: 'Total',
    payNow: 'Pagar',
    prototypeNotice: 'O pagamento não é efetuado no protótipo. No fluxo real, esta ação abre o Stripe Checkout e, após a confirmação do pagamento, a aula é marcada e é enviado por email um link para a conta.',
    close: 'Fechar',
    reviewCount: 'avaliações',
    languages: 'Idiomas',
    verified: 'Verificado',
    selected: 'Selecionado',
    stepLesson: '1. Escolha uma aula',
    stepTime: '2. Escolha um horário',
    pickFormat: 'Escolha o formato',
    pickDate: 'Escolha uma data',
    pickTime: 'Escolha um horário',
    duration: 'Duração',
    price: 'Preço',
    timeShownIn: 'Horários apresentados em:',
    continueBooking: 'Continuar pedido',
    trustLine: 'Sem compromisso · resposta por email',
    linkLessons: 'Aulas e preços',
    linkAbout: 'Como funcionam as aulas',
    linkReviews: 'Avaliações dos alunos',
    bookLesson: 'Marcar uma aula',
    free: 'Grátis',
    change: 'Alterar',
    linkBook: 'Reservar um horário',
    linkAboutMe: 'Sobre mim',
    linkAboutUs: 'Sobre nós',
    backToMenu: 'Voltar',
    bookThis: 'Marcar',
    basedIn: 'Localização',
    lessonsGiven: 'Avaliação',
    statusDraft: 'Rascunho',
    statusLive: 'Publicada',
    notLiveTitle: 'Esta página ainda não está publicada',
    notLiveBody: 'O proprietário ainda não a publicou. Após a publicação, ficará visível para todos.',
    loading: 'A carregar…',
    notFoundTitle: 'Página não encontrada',
    notFoundBody: 'Este endereço não existe ou a página já não está publicada.',
    enquiryIntro: 'Deixe os seus dados — entraremos em contacto para confirmar o horário.',
    messageLabel: 'Mensagem (opcional)',
    sendEnquiry: 'Enviar pedido',
    sending: 'A enviar…',
    enquirySentTitle: 'Pedido enviado',
    enquirySentBody: 'Recebemos o seu pedido — será contactado por email ou telefone para confirmar o horário.',
    enquiryFailed: 'Não foi possível enviar. Tente novamente.',
    enquiryTooMany: 'Demasiados pedidos seguidos. Tente novamente mais tarde.',
    noSlots: 'Não há horários livres disponíveis de momento — envie um pedido para combinarmos um horário.',
    noOfferings: 'A lista de aulas ainda está a ser preparada.',
    yourRequest: 'O seu pedido',
    anyTime: 'Qualquer horário',
  },
  'pt-br': {
    demoBanner: 'Protótipo — dados de exemplo. O agendamento e o pagamento reais ainda não estão conectados.',
    book: 'Agendar uma aula',
    bookShort: 'Agendar',
    about: 'Sobre',
    subjects: 'Aulas e preços',
    availability: 'Próximos horários disponíveis',
    reviews: 'Avaliações',
    noReviews: 'Nenhuma avaliação ainda.',
    reviewsOnlyStudents: 'Somente alunos que já tiveram aulas podem deixar uma avaliação.',
    perLesson: 'por aula',
    minutes: 'min',
    poweredBy: 'Desenvolvido por',
    selectSlot: 'Escolha um horário',
    yourDetails: 'Seus dados',
    payment: 'Pagamento',
    fullName: 'Nome completo',
    email: 'E-mail',
    phone: 'Telefone (opcional)',
    continue: 'Continuar',
    back: 'Voltar',
    lessonPrice: 'Preço da aula',
    serviceFee: 'Taxa de serviço',
    total: 'Total',
    payNow: 'Pagar',
    prototypeNotice: 'O pagamento não é realizado no protótipo. No fluxo real, esta ação abre o Stripe Checkout e, após a confirmação do pagamento, a aula é agendada e um link para a conta é enviado por e-mail.',
    close: 'Fechar',
    reviewCount: 'avaliações',
    languages: 'Idiomas',
    verified: 'Verificado',
    selected: 'Selecionado',
    stepLesson: '1. Escolha uma aula',
    stepTime: '2. Escolha um horário',
    pickFormat: 'Escolha o formato',
    pickDate: 'Escolha uma data',
    pickTime: 'Escolha um horário',
    duration: 'Duração',
    price: 'Preço',
    timeShownIn: 'Horários exibidos em:',
    continueBooking: 'Continuar solicitação',
    trustLine: 'Sem compromisso · resposta por e-mail',
    linkLessons: 'Aulas e preços',
    linkAbout: 'Como as aulas funcionam',
    linkReviews: 'Avaliações dos alunos',
    bookLesson: 'Agendar uma aula',
    free: 'Grátis',
    change: 'Alterar',
    linkBook: 'Reservar um horário',
    linkAboutMe: 'Sobre mim',
    linkAboutUs: 'Sobre nós',
    backToMenu: 'Voltar',
    bookThis: 'Agendar',
    basedIn: 'Localização',
    lessonsGiven: 'Avaliação',
    statusDraft: 'Rascunho',
    statusLive: 'Publicada',
    notLiveTitle: 'Esta página ainda não está publicada',
    notLiveBody: 'O proprietário ainda não a publicou. Após a publicação, ela ficará visível para todos.',
    loading: 'Carregando…',
    notFoundTitle: 'Página não encontrada',
    notFoundBody: 'Este endereço não existe ou a página não está mais publicada.',
    enquiryIntro: 'Deixe seus dados — entraremos em contato para confirmar o horário.',
    messageLabel: 'Mensagem (opcional)',
    sendEnquiry: 'Enviar solicitação',
    sending: 'Enviando…',
    enquirySentTitle: 'Solicitação enviada',
    enquirySentBody: 'Sua solicitação foi recebida — entraremos em contato por e-mail ou telefone para confirmar o horário.',
    enquiryFailed: 'Não foi possível enviar. Tente novamente.',
    enquiryTooMany: 'Muitas solicitações seguidas. Tente novamente mais tarde.',
    noSlots: 'Nenhum horário livre listado no momento — envie uma solicitação para combinarmos um.',
    noOfferings: 'A lista de aulas ainda está sendo preparada.',
    yourRequest: 'Sua solicitação',
    anyTime: 'Qualquer horário',
  },
  ro: {
    demoBanner: 'Prototip — date de exemplu. Rezervările și plățile reale nu sunt încă integrate.',
    book: 'Rezervă o lecție',
    bookShort: 'Rezervă',
    about: 'Despre',
    subjects: 'Lecții și prețuri',
    availability: 'Următoarele intervale disponibile',
    reviews: 'Recenzii',
    noReviews: 'Nu există încă recenzii.',
    reviewsOnlyStudents: 'Doar elevii care au participat la lecții pot lăsa o recenzie.',
    perLesson: 'pe lecție',
    minutes: 'min',
    poweredBy: 'Oferit de',
    selectSlot: 'Alege o oră',
    yourDetails: 'Datele tale',
    payment: 'Plată',
    fullName: 'Nume complet',
    email: 'E-mail',
    phone: 'Telefon (opțional)',
    continue: 'Continuă',
    back: 'Înapoi',
    lessonPrice: 'Prețul lecției',
    serviceFee: 'Taxă de serviciu',
    total: 'Total',
    payNow: 'Achită',
    prototypeNotice: 'Plata nu este efectuată în prototip. În fluxul real se deschide Stripe Checkout, iar după plata reușită lecția este rezervată și un link către cont este trimis prin e-mail.',
    close: 'Închide',
    reviewCount: 'recenzii',
    languages: 'Limbi',
    verified: 'Verificat',
    selected: 'Selectat',
    stepLesson: '1. Alege o lecție',
    stepTime: '2. Alege o oră',
    pickFormat: 'Alege formatul',
    pickDate: 'Alege o dată',
    pickTime: 'Alege o oră',
    duration: 'Durată',
    price: 'Preț',
    timeShownIn: 'Orele sunt afișate în fusul orar:',
    continueBooking: 'Continuă cererea',
    trustLine: 'Fără obligații · răspuns prin e-mail',
    linkLessons: 'Lecții și prețuri',
    linkAbout: 'Cum se desfășoară lecțiile',
    linkReviews: 'Recenziile elevilor',
    bookLesson: 'Rezervă o lecție',
    free: 'Gratuit',
    change: 'Schimbă',
    linkBook: 'Rezervă un interval',
    linkAboutMe: 'Despre mine',
    linkAboutUs: 'Despre noi',
    backToMenu: 'Înapoi',
    bookThis: 'Rezervă',
    basedIn: 'Locație',
    lessonsGiven: 'Evaluare',
    statusDraft: 'Ciornă',
    statusLive: 'Publicată',
    notLiveTitle: 'Această pagină nu este încă publicată',
    notLiveBody: 'Proprietarul nu a publicat-o încă. După publicare va fi vizibilă pentru toată lumea.',
    loading: 'Se încarcă…',
    notFoundTitle: 'Pagina nu a fost găsită',
    notFoundBody: 'Adresa nu există sau pagina nu mai este publicată.',
    enquiryIntro: 'Lasă datele tale — te vom contacta și vom confirma ora.',
    messageLabel: 'Mesaj (opțional)',
    sendEnquiry: 'Trimite cererea',
    sending: 'Se trimite…',
    enquirySentTitle: 'Cerere trimisă',
    enquirySentBody: 'Cererea ta a fost primită — vei fi contactat prin e-mail sau telefon pentru confirmarea orei.',
    enquiryFailed: 'Cererea nu a putut fi trimisă. Încearcă din nou.',
    enquiryTooMany: 'Prea multe cereri consecutive. Încearcă din nou mai târziu.',
    noSlots: 'Momentan nu sunt afișate intervale disponibile — trimite o cerere și vom stabili unul.',
    noOfferings: 'Lista lecțiilor este încă în pregătire.',
    yourRequest: 'Cererea ta',
    anyTime: 'Oricând',
  },
  it: {
    demoBanner: 'Prototipo — dati di esempio. La prenotazione e il pagamento reali non sono ancora attivi.',
    book: 'Prenota una lezione',
    bookShort: 'Prenota',
    about: 'Informazioni',
    subjects: 'Lezioni e prezzi',
    availability: 'Prossimi orari disponibili',
    reviews: 'Recensioni',
    noReviews: 'Non ci sono ancora recensioni.',
    reviewsOnlyStudents: 'Solo gli studenti che hanno seguito lezioni possono lasciare una recensione.',
    perLesson: 'a lezione',
    minutes: 'min',
    poweredBy: 'Realizzato con',
    selectSlot: 'Scegli un orario',
    yourDetails: 'I tuoi dati',
    payment: 'Pagamento',
    fullName: 'Nome e cognome',
    email: 'Email',
    phone: 'Telefono (facoltativo)',
    continue: 'Continua',
    back: 'Indietro',
    lessonPrice: 'Prezzo della lezione',
    serviceFee: 'Commissione di servizio',
    total: 'Totale',
    payNow: 'Paga',
    prototypeNotice: 'Nel prototipo il pagamento non viene eseguito. Nel flusso reale si apre Stripe Checkout e, dopo il pagamento, la lezione viene prenotata e ricevi via email un link per accedere al tuo account.',
    close: 'Chiudi',
    reviewCount: 'recensioni',
    languages: 'Lingue',
    verified: 'Verificato',
    selected: 'Selezionato',
    stepLesson: '1. Scegli una lezione',
    stepTime: '2. Scegli un orario',
    pickFormat: 'Scegli la modalità',
    pickDate: 'Scegli una data',
    pickTime: 'Scegli un orario',
    duration: 'Durata',
    price: 'Prezzo',
    timeShownIn: 'Fuso orario:',
    continueBooking: 'Continua la richiesta',
    trustLine: 'Senza impegno · risposta via email',
    linkLessons: 'Lezioni e prezzi',
    linkAbout: 'Come si svolgono le lezioni',
    linkReviews: 'Recensioni degli studenti',
    bookLesson: 'Prenota una lezione',
    free: 'Gratis',
    change: 'Modifica',
    linkBook: 'Prenota un orario',
    linkAboutMe: 'Chi sono',
    linkAboutUs: 'Chi siamo',
    backToMenu: 'Indietro',
    bookThis: 'Prenota',
    basedIn: 'Località',
    lessonsGiven: 'Valutazione',
    statusDraft: 'Bozza',
    statusLive: 'Pubblicata',
    notLiveTitle: 'Questa pagina non è ancora pubblicata',
    notLiveBody: 'Il titolare non ha ancora pubblicato la pagina. Dopo la pubblicazione sarà visibile a tutti.',
    loading: 'Caricamento…',
    notFoundTitle: 'Pagina non trovata',
    notFoundBody: 'Questo indirizzo non esiste oppure la pagina non è più pubblicata.',
    enquiryIntro: 'Lascia i tuoi recapiti: ti contatteremo per confermare l’orario.',
    messageLabel: 'Messaggio (facoltativo)',
    sendEnquiry: 'Invia richiesta',
    sending: 'Invio in corso…',
    enquirySentTitle: 'Richiesta inviata',
    enquirySentBody: 'La tua richiesta è stata ricevuta. Sarai contattato via email o telefono per confermare l’orario.',
    enquiryFailed: 'Invio non riuscito. Riprova.',
    enquiryTooMany: 'Troppe richieste consecutive. Riprova più tardi.',
    noSlots: 'Al momento non ci sono orari disponibili. Invia una richiesta per concordarne uno.',
    noOfferings: 'L’elenco delle lezioni è ancora in preparazione.',
    yourRequest: 'La tua richiesta',
    anyTime: 'Qualsiasi orario',
  },
  'es-mx': {
    demoBanner: 'Prototipo con datos de ejemplo. Las reservas y los pagos reales aún no están conectados.',
    book: 'Reservar una clase',
    bookShort: 'Reservar',
    about: 'Acerca de',
    subjects: 'Clases y precios',
    availability: 'Próximos horarios disponibles',
    reviews: 'Reseñas',
    noReviews: 'Aún no hay reseñas.',
    reviewsOnlyStudents: 'Solo pueden dejar reseñas los alumnos que hayan tomado clases.',
    perLesson: 'por clase',
    minutes: 'min',
    poweredBy: 'Con tecnología de',
    selectSlot: 'Elija un horario',
    yourDetails: 'Sus datos',
    payment: 'Pago',
    fullName: 'Nombre completo',
    email: 'Correo electrónico',
    phone: 'Teléfono (opcional)',
    continue: 'Continuar',
    back: 'Volver',
    lessonPrice: 'Precio de la clase',
    serviceFee: 'Cargo por servicio',
    total: 'Total',
    payNow: 'Pagar',
    prototypeNotice: 'El prototipo no realiza pagos. En el proceso real se abre Stripe Checkout y, si el pago se completa, se reserva la clase y se envía un enlace de acceso a la cuenta por correo.',
    close: 'Cerrar',
    reviewCount: 'reseñas',
    languages: 'Idiomas',
    verified: 'Verificado',
    selected: 'Seleccionado',
    stepLesson: '1. Elija una clase',
    stepTime: '2. Elija un horario',
    pickFormat: 'Elija la modalidad',
    pickDate: 'Elija una fecha',
    pickTime: 'Elija un horario',
    duration: 'Duración',
    price: 'Precio',
    timeShownIn: 'Zona horaria:',
    continueBooking: 'Continuar solicitud',
    trustLine: 'Sin compromiso · respuesta por correo',
    linkLessons: 'Clases y precios',
    linkAbout: 'Cómo son las clases',
    linkReviews: 'Reseñas de alumnos',
    bookLesson: 'Reservar una clase',
    free: 'Gratis',
    change: 'Cambiar',
    linkBook: 'Reservar un horario',
    linkAboutMe: 'Acerca de mí',
    linkAboutUs: 'Acerca de nosotros',
    backToMenu: 'Volver',
    bookThis: 'Reservar',
    basedIn: 'Ubicación',
    lessonsGiven: 'Calificación',
    statusDraft: 'Borrador',
    statusLive: 'Publicada',
    notLiveTitle: 'Esta página aún no está publicada',
    notLiveBody: 'El propietario todavía no la ha publicado. Una vez publicada, será visible para todos.',
    loading: 'Cargando…',
    notFoundTitle: 'Página no encontrada',
    notFoundBody: 'Esta dirección no existe o la página ya no está publicada.',
    enquiryIntro: 'Deje sus datos de contacto; nos comunicaremos con usted para confirmar el horario.',
    messageLabel: 'Mensaje (opcional)',
    sendEnquiry: 'Enviar solicitud',
    sending: 'Enviando…',
    enquirySentTitle: 'Solicitud enviada',
    enquirySentBody: 'Recibimos su solicitud. Se comunicarán con usted por correo o teléfono para confirmar el horario.',
    enquiryFailed: 'No se pudo enviar. Inténtelo de nuevo.',
    enquiryTooMany: 'Se enviaron demasiadas solicitudes seguidas. Inténtelo más tarde.',
    noSlots: 'Por ahora no hay horarios disponibles. Envíe una solicitud para acordar uno.',
    noOfferings: 'La lista de clases aún se está preparando.',
    yourRequest: 'Su solicitud',
    anyTime: 'Cualquier horario',
  },
} as const;

/** Value types widened to string so every locale satisfies the same shape. */
export type ChromeCopy = { [K in keyof (typeof CHROME)['lt']]: string };

export function chromeFor(locale: Locale): ChromeCopy {
  if (locale === 'cs') return CHROME.cs;
  if (locale === 'nl') return CHROME.nl;
  if (locale === 'sl') return CHROME.sl;
  if (locale === 'el') return CHROME.el;
  if (locale === 'hu') return CHROME.hu;
  if (locale === 'sk') return CHROME.sk;
  if (locale === 'bg') return CHROME.bg;
  if (locale === 'uk') return CHROME.uk;
  if (locale === 'hr') return CHROME.hr;
  if (locale === 'th') return CHROME.th;
  if (locale === 'he') return CHROME.he;
  if (locale === 'ro') return CHROME.ro;
  if (locale === 'zh-hk') return CHROME['zh-hk'];
  if (locale === 'pt') return CHROME.pt;
  if (locale === 'tr') return CHROME.tr;
  if (locale === 'fil') return CHROME.fil;
  if (locale === 'ja') return CHROME.ja;
  if (locale === 'hi') return CHROME.hi;
  if (locale === 'ko') return CHROME.ko;
  if (locale === 'id') return CHROME.id;
  if (locale === 'ar') return CHROME.ar;
  if (locale === 'pt-br') return CHROME['pt-br'];
  if (locale === 'es-mx') return CHROME['es-mx'];
  if (locale === 'it') return CHROME.it;
  return locale === 'lt' ? CHROME.lt : CHROME.en;
}

/* ------------------------------------------------------------------ */
/* PROTOTYPE FIXTURES — fictional demo profiles, not real people.      */
/* ------------------------------------------------------------------ */

/** Slots relative to today so the availability picker always looks live. */
function upcoming(dayOffset: number, hour: number, durationMinutes = 60): PublicPageSlot {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return { start: d.toISOString(), durationMinutes };
}

function buildDemoPages(): Record<string, PublicPage> {
  return {
    demo: {
      slug: 'demo',
      ownerType: 'tutor',
      locale: 'lt',
      displayName: 'Rasa Demo',
      headline: 'Matematikos korepetitorė · 9–12 kl. ir VBE',
      bio: 'Ruošiu mokinius brandos egzaminui ir padedu užpildyti spragas nuo pagrindų. Dirbu individualiai, kiekvienam mokiniui sudarau atskirą planą ir kas mėnesį aptariu pažangą su tėvais. Pamokos vyksta nuotoliu arba Kaune.',
      initials: 'RD',
      tagline: { text: 'Matematika gali būti paprastesnė.', emphasis: 'paprastesnė.' },
      brandColor: '#4c2a85',
      brandColorSecondary: '#a98bc4',
      brandColorTertiary: '#f0a882',
      accentColor: '#d9f08f',
      accentTextColor: '#2f4718',
      backdropTheme: 'math',
      city: 'Kaunas',
      languages: ['Lietuvių', 'English'],
      timezone: 'Europe/Vilnius',
      formats: [
        { id: 'f1', kind: 'online', label: 'Nuotoliu' },
        { id: 'f2', kind: 'onsite', label: 'Kaune' },
      ],
      socials: { tiktok: '#', youtube: '#', x: '#', instagram: '#' },
      published: false,
      bookingEnabled: true,
      reviewsEnabled: true,
      ratingCount: 24,
      ratingAvg: 4.9,
      offerings: [
        { id: 'o1', title: 'Individuali pamoka', description: '9–12 klasė, pagal mokinio programą.', durationMinutes: 60, publicPrice: 30 },
        { id: 'o2', title: 'VBE intensyvas', description: 'Pasiruošimas brandos egzaminui.', durationMinutes: 90, publicPrice: 42, group: true },
        { id: 'o3', title: 'Bandomasis pokalbis', description: 'Susipažinimas ir žinių įvertinimas.', durationMinutes: 20, publicPrice: 0 },
      ],
      slots: [upcoming(1, 16), upcoming(1, 17), upcoming(1, 18), upcoming(2, 15), upcoming(2, 18), upcoming(4, 16), upcoming(4, 17), upcoming(5, 14), upcoming(5, 17)],
      reviews: [
        { id: 'r1', rating: 5, comment: 'Per pusmetį matematikos pažymys pakilo nuo 6 iki 9. Labai aiškiai paaiškina ir niekada neskuba.', authorDisplayName: 'Monika K.', subjectName: 'Matematika', createdAt: '2026-06-14' },
        { id: 'r2', rating: 5, comment: 'Sūnus pirmą kartą pats paprašė papildomos pamokos. Tiek pasakau.', authorDisplayName: 'Darius V.', subjectName: 'VBE intensyvas', createdAt: '2026-05-28' },
        { id: 'r3', rating: 4, comment: 'Labai gera korepetitorė, tik laikų sunku gauti — greitai išsigraibsto.', authorDisplayName: 'Eglė P.', subjectName: 'Matematika', createdAt: '2026-05-03' },
      ],
    },
    'demo-mokykla': {
      slug: 'demo-mokykla',
      ownerType: 'organization',
      locale: 'lt',
      displayName: 'Kalbų studija Demo',
      headline: 'Anglų, vokiečių ir ispanų kalbos · grupės ir individualiai',
      bio: 'Kalbų studija su 8 dėstytojais. Mokome nuo A1 iki C1, ruošiame Cambridge ir Goethe egzaminams. Grupės iki 6 žmonių, individualios pamokos nuotoliu arba Vilniaus centre.',
      initials: 'KD',
      tagline: { text: 'Kalba, kuria drįsti kalbėti.', emphasis: 'drįsti kalbėti.' },
      brandColor: '#7a1633',
      brandColorSecondary: '#c96a5a',
      brandColorTertiary: '#f0b06a',
      accentColor: '#ffe08a',
      accentTextColor: '#5c3a05',
      backdropTheme: 'language',
      city: 'Vilnius',
      languages: ['Lietuvių', 'English', 'Deutsch', 'Español'],
      timezone: 'Europe/Vilnius',
      formats: [
        { id: 'f1', kind: 'online', label: 'Nuotoliu' },
        { id: 'f2', kind: 'onsite', label: 'Vilniuje' },
      ],
      socials: { youtube: '#', instagram: '#', facebook: '#' },
      published: false,
      bookingEnabled: true,
      reviewsEnabled: true,
      ratingCount: 61,
      ratingAvg: 4.7,
      offerings: [
        { id: 'o1', title: 'Anglų kalba', description: 'Bet koks lygis, pagal poreikį.', durationMinutes: 60, publicPrice: 28 },
        { id: 'o2', title: 'Vokiečių kalba', description: 'A1–C1, taip pat Goethe egzaminui.', durationMinutes: 60, publicPrice: 28 },
        { id: 'o3', title: 'Ispanų grupė', description: 'Iki 6 žmonių, kas savaitę.', durationMinutes: 90, publicPrice: 19, group: true },
      ],
      slots: [upcoming(1, 10), upcoming(1, 18), upcoming(1, 19), upcoming(3, 11), upcoming(3, 17), upcoming(6, 12), upcoming(6, 19)],
      reviews: [
        { id: 'r1', rating: 5, comment: 'Per metus pasiekiau B2 ir išlaikiau Cambridge. Dėstytojai tikrai stiprūs.', authorDisplayName: 'Tomas R.', subjectName: 'Anglų kalba', createdAt: '2026-06-20' },
        { id: 'r2', rating: 5, comment: 'Patogu, kad viską — laikus, mokėjimus, atšaukimus — matai vienoje vietoje.', authorDisplayName: 'Aistė M.', subjectName: 'Vokiečių kalba', createdAt: '2026-06-02' },
        { id: 'r3', rating: 4, comment: 'Labai gerai, bet norėtųsi daugiau vakarinių laikų.', authorDisplayName: 'Justas B.', subjectName: 'Ispanų kalba', createdAt: '2026-04-19' },
      ],
    },
  };
}

export const DEMO_PAGES = buildDemoPages();
export const DEMO_SLUGS = Object.keys(DEMO_PAGES);

export function getDemoPage(slug: string | undefined): PublicPage | null {
  if (!slug) return null;
  return DEMO_PAGES[slug] ?? null;
}

/** The demo fixtures are published by definition — they exist to be shown. */
for (const page of Object.values(DEMO_PAGES)) page.published = true;
