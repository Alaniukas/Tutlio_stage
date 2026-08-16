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
 * Still prototype: CHROME is a two-locale object rather than real i18n keys
 * across all 13 locales.
 */

import type { Locale } from './i18n/core';

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

const PUBLIC_PAGE_SEO_LOCALES = new Set<Locale>([
  'lt', 'en', 'pl', 'lv', 'ee', 'fr', 'es', 'de', 'se', 'dk', 'fi', 'no', 'nl',
]);

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
  if (!PUBLIC_PAGE_SEO_LOCALES.has(candidate.locale as Locale)) reasons.push('invalid-locale');

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
    timezone: row.timezone,
    // Formats are implied by the presence of a city: online is always offered,
    // on-site only when the owner named a place.
    formats: [
      { id: 'online', kind: 'online', label: row.locale === 'lt' ? 'Nuotoliu' : 'Online' },
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
  const d = new Date(`${dayIso}T00:00:00`);
  if (locale === 'lt') return `${LT_SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

/** Upcoming slots grouped by calendar day, for the availability picker. */
export function groupSlotsByDay(slots: PublicPageSlot[]): { day: string; slots: PublicPageSlot[] }[] {
  const byDay = new Map<string, PublicPageSlot[]>();
  for (const slot of slots) {
    const day = slot.start.slice(0, 10);
    const bucket = byDay.get(day);
    if (bucket) bucket.push(slot);
    else byDay.set(day, [slot]);
  }
  return [...byDay.entries()].map(([day, s]) => ({ day, slots: s }));
}

/* ------------------------------------------------------------------ */
/* PROTOTYPE ONLY — replaced by i18n keys (13 locales) in Phase 1.     */
/* Page *content* (name, bio, subjects) stays fixture/DB data; only    */
/* these UI chrome labels become translation keys.                     */
/* ------------------------------------------------------------------ */

export const CHROME = {
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
} as const;

/** Value types widened to string so every locale satisfies the same shape. */
export type ChromeCopy = { [K in keyof (typeof CHROME)['lt']]: string };

export function chromeFor(locale: Locale): ChromeCopy {
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
