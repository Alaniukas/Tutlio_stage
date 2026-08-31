import {
  PRODUCT_SUPPORT_PAGE_IDS,
  PUBLIC_PRODUCT_FEATURES,
  type ProductSupportPageId,
  type PublicProductFeatureId,
} from './productFeatureCatalog.js';

export const SUPPORT_PAGE_IDS = PRODUCT_SUPPORT_PAGE_IDS;
export type SupportPageId = ProductSupportPageId;

export type SupportPageSuggestion = {
  id: SupportPageId;
  href: string;
  labelKey: string;
  description: string;
};

export const SUPPORT_PAGE_SUGGESTIONS: Record<SupportPageId, SupportPageSuggestion> = {
  features_overview: {
    id: 'features_overview',
    href: '/features',
    labelKey: 'nav.features',
    description: 'General overview of Tutlio product capabilities, including the interactive lesson whiteboard, messaging, parent portals, reporting, and branding.',
  },
  pricing: {
    id: 'pricing',
    href: '/pricing',
    labelKey: 'pricing.title',
    description: 'Solo plans and trial plus the self-service tutor-license calculator and checkout for agencies, companies, and schools.',
  },
  about: {
    id: 'about',
    href: '/apie-mus',
    labelKey: 'nav.aboutUs',
    description: 'Information about Tutlio and the company behind it.',
  },
  calendar: {
    id: 'calendar',
    href: '/features/calendar',
    labelKey: 'feature.calendar.pageTitle',
    description: 'Tutor calendar, lesson scheduling, and availability.',
  },
  digital_business_card: {
    id: 'digital_business_card',
    href: '/features/digital-business-card',
    labelKey: 'feature.digital-business-card.pageTitle',
    description: 'Public tutor page and digital business card.',
  },
  waitlist: {
    id: 'waitlist',
    href: '/features/waitlist',
    labelKey: 'feature.waitlist.pageTitle',
    description: 'Waitlist and collecting interest from prospective students.',
  },
  payments: {
    id: 'payments',
    href: '/features/payments',
    labelKey: 'feature.payments.pageTitle',
    description: 'Student payments, payment tracking, and related billing tools.',
  },
  comments: {
    id: 'comments',
    href: '/features/comments',
    labelKey: 'feature.comments.pageTitle',
    description: 'Lesson comments and communication around learning progress.',
  },
  contact: {
    id: 'contact',
    href: '/kontaktai',
    labelKey: 'contact.title',
    description: 'Public contact page for reaching the Tutlio team.',
  },
  schools: {
    id: 'schools',
    href: '/schools',
    labelKey: 'nav.brandSchools',
    description: 'Tutlio for schools, including administration and contract workflows.',
  },
  cancellation: {
    id: 'cancellation',
    href: '/features/cancellation',
    labelKey: 'feature.cancellation.pageTitle',
    description: 'Lesson cancellation settings and policies.',
  },
  reminders: {
    id: 'reminders',
    href: '/features/reminders',
    labelKey: 'feature.reminders.pageTitle',
    description: 'Automated lesson and payment reminders.',
  },
  privacy: {
    id: 'privacy',
    href: '/privacy-policy',
    labelKey: 'priv.title',
    description: 'Tutlio privacy and personal-data policy.',
  },
};

export function supportPageRouterCatalog(): string {
  return SUPPORT_PAGE_IDS
    .map((id) => {
      const page = SUPPORT_PAGE_SUGGESTIONS[id];
      return `- ${id}: ${page.href} — ${page.description}`;
    })
    .join('\n');
}

export function parseSupportPageIds(value: unknown): SupportPageId[] {
  const candidates = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const seen = new Set<SupportPageId>();

  for (const candidate of candidates) {
    const id = typeof candidate === 'string' ? candidate.trim() : '';
    if (SUPPORT_PAGE_IDS.includes(id as SupportPageId)) seen.add(id as SupportPageId);
    if (seen.size === 3) break;
  }

  return [...seen];
}

/** Canonical page mappings for feature chunks selected by the support model. */
export function supportPagesForProductFeatures(
  featureIds: readonly PublicProductFeatureId[],
  limit = 3,
): SupportPageId[] {
  const pageIds = featureIds.flatMap((featureId) => [
    ...PUBLIC_PRODUCT_FEATURES[featureId].suggestedPageIds,
  ]);
  return parseSupportPageIds(pageIds).slice(0, Math.max(0, limit));
}
