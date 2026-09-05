/**
 * Single source of truth for the public competitor comparison pages
 * (/compare and /compare/<competitor>). Shared by the SPA routes
 * (src/pages/ComparePage.tsx, src/pages/CompareIndexPage.tsx) and the bot
 * SSR renderer (api/compare-render.ts) so crawlers and humans read the same
 * claims. Keep this file dependency-free: middleware.ts mirrors the id list.
 *
 * Every claim about a competitor comes from that vendor's public website as
 * reviewed on COMPARE_REVIEWED_ON. `na` deliberately means "we could not
 * confirm this from public materials", never "they lack it". The pages carry
 * no price figures on purpose: pricing models only, never amounts.
 */
export type ComparisonPageId = 'tutorbird' | 'tutorcruncher' | 'teachworks' | 'oases-online';

export interface ComparisonPageConfig {
  id: ComparisonPageId;
  /** Trademark as the vendor writes it. */
  name: string;
  /** Vendor's public site — for the trademark notice, never linked with follow. */
  website: string;
  path: string;
  /** Prefix for the competitor-specific dictionary keys (compare.<prefix>.…). */
  keyPrefix: string;
}

export const COMPARE_HUB_PATH = '/compare';

/** Bump whenever competitor facts are re-checked — shown on the page and as <lastmod>. */
export const COMPARE_REVIEWED_ON = '2026-09-05';

export const COMPARISON_PAGES: Record<ComparisonPageId, ComparisonPageConfig> = {
  tutorbird: {
    id: 'tutorbird',
    name: 'TutorBird',
    website: 'https://www.tutorbird.com',
    path: '/compare/tutorbird',
    keyPrefix: 'tutorbird',
  },
  tutorcruncher: {
    id: 'tutorcruncher',
    name: 'TutorCruncher',
    website: 'https://tutorcruncher.com',
    path: '/compare/tutorcruncher',
    keyPrefix: 'tutorcruncher',
  },
  teachworks: {
    id: 'teachworks',
    name: 'Teachworks',
    website: 'https://teachworks.com',
    path: '/compare/teachworks',
    keyPrefix: 'teachworks',
  },
  'oases-online': {
    id: 'oases-online',
    name: 'Oases Online',
    website: 'https://www.oasesonline.com',
    path: '/compare/oases-online',
    keyPrefix: 'oases',
  },
};

export const COMPARISON_PAGE_IDS = Object.keys(COMPARISON_PAGES) as ComparisonPageId[];

export function isComparisonPageId(value: string): value is ComparisonPageId {
  return value in COMPARISON_PAGES;
}

/** Cell states of the feature matrix. `text` renders the note verbatim (e.g. a language count). */
export type CompareCellValue = 'yes' | 'partial' | 'no' | 'na' | 'text';

export interface CompareCell {
  value: CompareCellValue;
  /** Literal note that needs no translation (product names, numbers). */
  note?: string;
  /** Translated note — a dictionary key. */
  noteKey?: string;
}

export interface CompareRow {
  /** Dictionary key suffix: compare.row.<key>. */
  key: string;
  tutlio: CompareCell;
  competitors: Record<ComparisonPageId, CompareCell>;
}

const yes = (note?: string, noteKey?: string): CompareCell => ({ value: 'yes', note, noteKey });
const partial = (note?: string, noteKey?: string): CompareCell => ({ value: 'partial', note, noteKey });
const no = (noteKey?: string): CompareCell => ({ value: 'no', noteKey });
const na: CompareCell = { value: 'na' };
const text = (note?: string, noteKey?: string): CompareCell => ({ value: 'text', note, noteKey });

/**
 * Feature-by-feature matrix. Row order is the page order. Tutlio cells must
 * stay truthful to the shipped product: e.g. reminders are email + push, not
 * SMS, and there is no public API.
 */
export const COMPARE_ROWS: CompareRow[] = [
  {
    key: 'calendar',
    tutlio: yes(undefined, 'compare.note.tutlio.calendar'),
    competitors: { tutorbird: yes(), tutorcruncher: yes(), teachworks: yes(), 'oases-online': yes() },
  },
  {
    key: 'portal',
    tutlio: yes(),
    competitors: {
      tutorbird: yes(),
      tutorcruncher: yes(undefined, 'compare.note.clientPortal'),
      teachworks: yes(),
      'oases-online': partial(undefined, 'compare.note.parentPortalOnly'),
    },
  },
  {
    key: 'publicPage',
    tutlio: yes(undefined, 'compare.note.tutlio.publicPage'),
    competitors: {
      tutorbird: yes(undefined, 'compare.note.websiteBuilder'),
      tutorcruncher: na,
      teachworks: partial(undefined, 'compare.note.bookingPlugin'),
      'oases-online': yes(undefined, 'compare.note.storefronts'),
    },
  },
  {
    key: 'waitlist',
    tutlio: yes(undefined, 'compare.note.tutlio.waitlist'),
    competitors: { tutorbird: na, tutorcruncher: na, teachworks: na, 'oases-online': na },
  },
  {
    key: 'payments',
    tutlio: yes('Stripe'),
    competitors: {
      tutorbird: yes('Stripe, PayPal'),
      tutorcruncher: yes(undefined, 'compare.note.multipleMethods'),
      teachworks: yes('Stripe, PayPal'),
      'oases-online': yes('Stripe, Authorize.net'),
    },
  },
  {
    key: 'emailReminders',
    tutlio: yes(),
    competitors: { tutorbird: yes(), tutorcruncher: yes(), teachworks: yes(), 'oases-online': yes() },
  },
  {
    key: 'smsReminders',
    tutlio: no('compare.note.tutlio.sms'),
    competitors: {
      tutorbird: yes(undefined, 'compare.note.smsIncluded'),
      tutorcruncher: yes(undefined, 'compare.note.perMessage'),
      teachworks: partial(undefined, 'compare.note.addOn'),
      'oases-online': yes('Twilio'),
    },
  },
  {
    key: 'tutorPay',
    tutlio: yes(undefined, 'compare.note.tutlio.tutorPay'),
    competitors: {
      tutorbird: yes(),
      tutorcruncher: yes('Xero, QuickBooks'),
      teachworks: yes(),
      'oases-online': yes(),
    },
  },
  {
    key: 'contracts',
    tutlio: yes(undefined, 'compare.note.tutlio.contracts'),
    competitors: { tutorbird: na, tutorcruncher: na, teachworks: na, 'oases-online': na },
  },
  {
    key: 'whiteboard',
    tutlio: yes(),
    competitors: {
      tutorbird: na,
      tutorcruncher: partial(undefined, 'compare.note.thirdParty'),
      teachworks: na,
      'oases-online': yes(),
    },
  },
  {
    key: 'branding',
    tutlio: yes(undefined, 'compare.note.tutlio.branding'),
    competitors: {
      tutorbird: partial(undefined, 'compare.note.websiteBuilder'),
      tutorcruncher: yes(undefined, 'compare.note.customDomainPaid'),
      teachworks: partial(undefined, 'compare.note.customDomainPaid'),
      'oases-online': partial(undefined, 'compare.note.storefronts'),
    },
  },
  {
    key: 'integrations',
    tutlio: partial(undefined, 'compare.note.tutlio.integrations'),
    competitors: {
      tutorbird: yes('QuickBooks, Zapier, Zoom, Google Calendar'),
      tutorcruncher: yes('Xero, QuickBooks, API'),
      teachworks: yes('QuickBooks, Zapier, Zoom, API'),
      'oases-online': partial('Mailchimp, Twilio'),
    },
  },
  {
    key: 'languages',
    tutlio: text('36'),
    competitors: {
      tutorbird: text('6'),
      tutorcruncher: text(undefined, 'compare.note.english'),
      teachworks: text(undefined, 'compare.note.english'),
      'oases-online': text(undefined, 'compare.note.english'),
    },
  },
  {
    key: 'custom',
    tutlio: yes(undefined, 'compare.note.tutlio.custom'),
    competitors: { tutorbird: na, tutorcruncher: na, teachworks: na, 'oases-online': na },
  },
];

/** "At a glance" rows, each backed by compare.glance.<key> (label) and
 * compare.<competitor>.glance.<key> / compare.tutlio.glance.<key> (values). */
export const COMPARE_GLANCE_KEYS = ['bestFor', 'pricingModel', 'trial', 'languages', 'custom'] as const;
export type CompareGlanceKey = (typeof COMPARE_GLANCE_KEYS)[number];

export const COMPARE_FAQ_INDEXES = [1, 2, 3] as const;
export const COMPARE_REASON_INDEXES = [1, 2, 3] as const;

export function comparePagePath(id: ComparisonPageId): string {
  return COMPARISON_PAGES[id].path;
}

/** Every dictionary key a competitor page reads (used by the i18n integrity test). */
export function comparisonPageKeys(id: ComparisonPageId): string[] {
  const p = COMPARISON_PAGES[id].keyPrefix;
  return [
    `compare.${p}.metaDesc`,
    `compare.${p}.intro1`,
    `compare.${p}.intro2`,
    `compare.${p}.verdict`,
    ...COMPARE_GLANCE_KEYS.map((k) => `compare.${p}.glance.${k}`),
    ...COMPARE_REASON_INDEXES.flatMap((n) => [`compare.${p}.tutlioFor${n}`, `compare.${p}.themFor${n}`]),
    ...COMPARE_FAQ_INDEXES.flatMap((n) => [`compare.${p}.faq.q${n}`, `compare.${p}.faq.a${n}`]),
  ];
}

/** Shared keys every comparison page and the hub read. */
export const COMPARE_SHARED_KEYS = [
  'compare.hub.badge',
  'compare.hub.title',
  'compare.hub.subtitle',
  'compare.hub.metaTitle',
  'compare.hub.metaDesc',
  'compare.hub.cardCta',
  'compare.vsTitle',
  'compare.metaTitle',
  'compare.reviewed',
  'compare.glanceTitle',
  'compare.matrixTitle',
  'compare.matrixSub',
  'compare.legend.yes',
  'compare.legend.partial',
  'compare.legend.no',
  'compare.legend.na',
  'compare.chooseTutlio',
  'compare.chooseThem',
  'compare.customEyebrow',
  'compare.customTitle',
  'compare.customBody',
  'compare.customCta',
  'compare.customChip1',
  'compare.customChip2',
  'compare.customChip3',
  'compare.customChip4',
  'compare.faqTitle',
  'compare.switchTitle',
  'compare.switchBody',
  'compare.otherTitle',
  'compare.ctaTitle',
  'compare.ctaSub',
  'compare.ctaSolo',
  'compare.ctaAgency',
  'compare.disclaimer',
  ...COMPARE_GLANCE_KEYS.flatMap((k) => [`compare.glance.${k}`, `compare.tutlio.glance.${k}`]),
  ...COMPARE_ROWS.map((r) => `compare.row.${r.key}`),
  ...COMPARE_ROWS.flatMap((r) => [
    r.tutlio.noteKey,
    ...Object.values(r.competitors).map((c) => c.noteKey),
  ]).filter((k): k is string => !!k),
];
