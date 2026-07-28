/**
 * Single source of truth for the public marketing feature pages
 * (/features/<id>). Used by both the SPA route (src/pages/FeaturePage.tsx)
 * and the bot SSR renderer (api/feature-render.ts) so crawlers and humans
 * always see the same content.
 */
export type FeaturePageId =
  | 'calendar'
  | 'waitlist'
  | 'payments'
  | 'reminders'
  | 'cancellation'
  | 'comments';

export interface FeaturePageConfig {
  path: string;
  titleKey: string;
  descKey: string;
  detailKeys: string[];
  faqKeys: string[];
}

export const FEATURE_PAGES: Record<FeaturePageId, FeaturePageConfig> = {
  calendar: {
    path: '/features/calendar',
    titleKey: 'feature.calendar.pageTitle',
    descKey: 'feature.calendar.pageDesc',
    detailKeys: ['selfBooking', 'recurring', 'breaks', 'deadlines'],
    faqKeys: ['howBook', 'groupLessons', 'mobileCalendar'],
  },
  waitlist: {
    path: '/features/waitlist',
    titleKey: 'feature.waitlist.pageTitle',
    descKey: 'feature.waitlist.pageDesc',
    detailKeys: ['autoFill', 'notifications', 'priority', 'revenue'],
    faqKeys: ['howWorks', 'studentLimit', 'automatic'],
  },
  payments: {
    path: '/features/payments',
    titleKey: 'feature.payments.pageTitle',
    descKey: 'feature.payments.pageDesc',
    detailKeys: ['stripe', 'tracking', 'invoices', 'packages'],
    faqKeys: ['methods', 'fees', 'invoiceAuto'],
  },
  reminders: {
    path: '/features/reminders',
    titleKey: 'feature.reminders.pageTitle',
    descKey: 'feature.reminders.pageDesc',
    detailKeys: ['beforeLesson', 'afterLesson', 'paymentDue', 'customTiming'],
    faqKeys: ['channels', 'customize', 'disable'],
  },
  cancellation: {
    path: '/features/cancellation',
    titleKey: 'feature.cancellation.pageTitle',
    descKey: 'feature.cancellation.pageDesc',
    detailKeys: ['deadlines', 'fees', 'waitlistLink', 'transparency'],
    faqKeys: ['howSet', 'studentSee', 'refund'],
  },
  comments: {
    path: '/features/comments',
    titleKey: 'feature.comments.pageTitle',
    descKey: 'feature.comments.pageDesc',
    detailKeys: ['lessonNotes', 'fileSharing', 'history', 'parentAccess'],
    faqKeys: ['whoSees', 'fileTypes', 'storage'],
  },
};

export const FEATURE_PAGE_IDS = Object.keys(FEATURE_PAGES) as FeaturePageId[];

export function isFeaturePageId(value: string): value is FeaturePageId {
  return value in FEATURE_PAGES;
}

/** Landing highlight keys shown on /features hub (subset may link to deep pages). */
export const FEATURE_HUB_HIGHLIGHT_KEYS = [
  'calendar',
  'reminders',
  'messaging',
  'plans',
  'autoPayments',
  'invoices',
  'parents',
  'files',
  'stats',
  'waitlist',
  'whiteLabel',
  'whiteboard',
] as const;

export type FeatureHubHighlightKey = (typeof FEATURE_HUB_HIGHLIGHT_KEYS)[number];

/** Map landing highlight key → deep feature page when one exists. */
export const HIGHLIGHT_FEATURE_PAGE: Partial<Record<FeatureHubHighlightKey, FeaturePageId>> = {
  calendar: 'calendar',
  waitlist: 'waitlist',
  reminders: 'reminders',
  autoPayments: 'payments',
  invoices: 'payments',
  files: 'comments',
};

export function featureHubHighlightPath(key: FeatureHubHighlightKey): string | null {
  const pageId = HIGHLIGHT_FEATURE_PAGE[key];
  return pageId ? FEATURE_PAGES[pageId].path : null;
}
