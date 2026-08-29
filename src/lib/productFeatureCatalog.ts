export const PRODUCT_SUPPORT_AREA_IDS = [
  'getting_started',
  'tutor_workspace',
  'students_parents',
  'organizations',
  'schools_contracts',
  'payments_billing',
  'integrations_messages',
  'troubleshooting_security',
] as const;

export type ProductSupportAreaId = (typeof PRODUCT_SUPPORT_AREA_IDS)[number];

export const PRODUCT_SUPPORT_PAGE_IDS = [
  'features_overview',
  'pricing',
  'about',
  'calendar',
  'digital_business_card',
  'waitlist',
  'payments',
  'comments',
  'contact',
  'schools',
  'cancellation',
  'reminders',
  'privacy',
] as const;

export type ProductSupportPageId = (typeof PRODUCT_SUPPORT_PAGE_IDS)[number];

/** Public feature cards rendered on the Tutlio feature hub. */
export const PUBLIC_PRODUCT_FEATURE_HUB_IDS = [
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

/** Detailed public feature pages that are not already named by a hub card. */
export const PUBLIC_PRODUCT_DEEP_ONLY_FEATURE_IDS = [
  'digital-business-card',
  'cancellation',
  'comments',
] as const;

export const PUBLIC_PRODUCT_FEATURE_IDS = [
  ...PUBLIC_PRODUCT_FEATURE_HUB_IDS,
  ...PUBLIC_PRODUCT_DEEP_ONLY_FEATURE_IDS,
] as const;

export type PublicProductFeatureId = (typeof PUBLIC_PRODUCT_FEATURE_IDS)[number];

export type PublicDeepFeaturePageId =
  | 'digital-business-card'
  | 'calendar'
  | 'waitlist'
  | 'payments'
  | 'reminders'
  | 'cancellation'
  | 'comments';

export interface PublicProductFeatureKnowledge {
  id: PublicProductFeatureId;
  label: string;
  areaId: ProductSupportAreaId;
  aliases: readonly string[];
  facts: readonly string[];
  suggestedPageIds: readonly ProductSupportPageId[];
  deepFeaturePageId?: PublicDeepFeaturePageId;
}

/**
 * Canonical public feature knowledge shared by the marketing feature hub,
 * support retrieval, verified page suggestions, and coverage tests.
 * Facts must describe public product behavior and must not contain private
 * implementation details or account-specific promises.
 */
export const PUBLIC_PRODUCT_FEATURES = {
  calendar: {
    id: 'calendar',
    label: 'Smart calendar and scheduling',
    areaId: 'tutor_workspace',
    aliases: ['calendar', 'scheduling', 'availability', 'kalendorius', 'tvarkaraštis', 'kalendarz', 'terminy'],
    facts: [
      'Tutlio has a visual calendar for one-time and recurring lessons, lesson status, and tutor availability.',
      'Tutors control available time, booking deadlines, and breaks; students can self-book only within those rules when self-booking is enabled.',
      'Tutlio works on desktop, tablet, and phone and can be installed as a Progressive Web App.',
    ],
    suggestedPageIds: ['calendar'],
    deepFeaturePageId: 'calendar',
  },
  reminders: {
    id: 'reminders',
    label: 'Automated reminders',
    areaId: 'integrations_messages',
    aliases: ['reminder', 'notification', 'email reminder', 'priminimas', 'pranešimas', 'przypomnienie', 'powiadomienie'],
    facts: [
      'Tutlio sends applicable automated email reminders before lessons, after lessons, and for overdue payments.',
      'Reminder timing follows the configured tutor or organization settings, and localized messages use the recipient language where available.',
      'Tutlio does not currently provide SMS reminders.',
    ],
    suggestedPageIds: ['reminders'],
    deepFeaturePageId: 'reminders',
  },
  messaging: {
    id: 'messaging',
    label: 'Built-in messaging',
    areaId: 'integrations_messages',
    aliases: ['message', 'messaging', 'chat', 'žinutė', 'pokalbis', 'wiadomość', 'czat'],
    facts: [
      'Tutlio includes built-in messages between the relevant tutor or organization, student, and parent accounts.',
      'Message visibility follows each user role and organization access permissions.',
    ],
    suggestedPageIds: ['features_overview'],
  },
  plans: {
    id: 'plans',
    label: 'Lesson packages and payment plans',
    areaId: 'payments_billing',
    aliases: ['lesson package', 'package', 'payment plan', 'pamokų paketas', 'mokėjimo planas', 'pakiet lekcji', 'plan płatności'],
    facts: [
      'Tutors and organizations can create lesson packages with prepaid lesson credit and track the remaining lesson count.',
      'Package subject, price, discount, and lesson quantity can vary according to the configured offer.',
    ],
    suggestedPageIds: ['payments'],
    deepFeaturePageId: 'payments',
  },
  autoPayments: {
    id: 'autoPayments',
    label: 'Stripe payments and payment tracking',
    areaId: 'payments_billing',
    aliases: ['payment', 'Stripe', 'card payment', 'automatic payment', 'mokėjimas', 'automatinis mokėjimas', 'płatność', 'płatność automatyczna'],
    facts: [
      'Tutlio supports eligible student lesson and package payments through Stripe and can also track configured manual payment flows.',
      'Payment status remains linked to the related lesson, package, school installment, or invoice.',
      'An uncertain or still-processing payment must be checked by support rather than guessed or submitted repeatedly.',
    ],
    suggestedPageIds: ['payments'],
    deepFeaturePageId: 'payments',
  },
  invoices: {
    id: 'invoices',
    label: 'Invoice generation',
    areaId: 'payments_billing',
    aliases: ['invoice', 'billing document', 'sąskaita', 'sąskaita faktūra', 'faktura', 'rachunek'],
    facts: [
      'Tutors and organizations can generate invoices for students or parents, send them, and download PDF copies.',
      'Required seller and buyer details must be configured before a valid invoice can be generated.',
    ],
    suggestedPageIds: ['payments'],
    deepFeaturePageId: 'payments',
  },
  parents: {
    id: 'parents',
    label: 'Parent accounts and portal',
    areaId: 'students_parents',
    aliases: ['parent', 'parent portal', 'child account', 'tėvai', 'tėvų portalas', 'vaikas', 'rodzic', 'portal rodzica', 'dziecko'],
    facts: [
      'A parent can use a dedicated portal to view linked children, lessons, invoices, available payments, and messages.',
      'One parent account can manage more than one linked child when the tutor or organization has created the invitations.',
    ],
    suggestedPageIds: ['features_overview'],
  },
  files: {
    id: 'files',
    label: 'Lesson files and homework',
    areaId: 'integrations_messages',
    aliases: ['file', 'document', 'homework', 'material', 'failas', 'dokumentas', 'namų darbai', 'plik', 'dokument', 'zadanie domowe'],
    facts: [
      'Tutors can keep lesson files, homework, and learning materials connected to the relevant lesson and student history.',
      'Shared files and notes are available only to roles that have permission to see them.',
    ],
    suggestedPageIds: ['comments'],
    deepFeaturePageId: 'comments',
  },
  stats: {
    id: 'stats',
    label: 'Statistics and reporting',
    areaId: 'organizations',
    aliases: ['statistics', 'analytics', 'report', 'KPI', 'statistika', 'analitika', 'ataskaita', 'statystyki', 'raport'],
    facts: [
      'Tutlio finance and reporting views summarize relevant lesson activity, revenue, and payment status.',
      'Organization and school administrators can use team-wide operational, finance, attendance, or installment reporting according to their permissions.',
    ],
    suggestedPageIds: ['features_overview'],
  },
  waitlist: {
    id: 'waitlist',
    label: 'Student waitlist',
    areaId: 'tutor_workspace',
    aliases: ['waitlist', 'waiting list', 'cancelled slot', 'laukiančiųjų sąrašas', 'eilė', 'atšauktas laikas', 'lista oczekujących', 'odwołany termin'],
    facts: [
      'Students can join the waitlist for preferred time, and Tutlio can offer a freed cancelled slot to interested students.',
      'The waitlist helps tutors refill cancelled time without manually contacting every interested student.',
    ],
    suggestedPageIds: ['waitlist'],
    deepFeaturePageId: 'waitlist',
  },
  whiteLabel: {
    id: 'whiteLabel',
    label: 'Organization and school branding',
    areaId: 'organizations',
    aliases: ['white label', 'branding', 'logo and colors', 'prekinis ženklas', 'logotipas ir spalvos', 'własna marka', 'logo i kolory'],
    facts: [
      'Organizations and schools can apply their logo and colors so students and parents see the institution visual identity in their portal.',
      'Available branding options depend on the organization configuration.',
    ],
    suggestedPageIds: ['features_overview', 'schools'],
  },
  whiteboard: {
    id: 'whiteboard',
    label: 'Interactive lesson whiteboard',
    areaId: 'tutor_workspace',
    aliases: [
      'whiteboard', 'interactive whiteboard', 'shared board',
      'interaktyvi lenta', 'lenta',
      'tablica interaktywna', 'tablicę interaktywną', 'tablica', 'tablicę',
      'interaktīvā tāfele', 'baltā tāfele',
      'interaktiivne tahvel', 'tahvel',
      'tableau blanc',
      'pizarra interactiva', 'pizarra',
      'interaktives Whiteboard', 'interaktive Tafel',
      'interaktiv whiteboard', 'interaktiv skrivtavla',
      'interaktiv tavle',
      'interaktiivinen valkotaulu', 'valkotaulu',
      'interactief whiteboard',
    ],
    facts: [
      'Tutlio includes an interactive whiteboard tied to a lesson for real-time collaboration during online lessons.',
      'Authorized lesson participants open the whiteboard from the lesson details, normally in a separate browser tab.',
      'Whiteboard work can be saved and downloaded as a PDF.',
      'After a lesson is marked completed, its whiteboard remains available until two hours after the scheduled lesson end; after that access closes.',
    ],
    suggestedPageIds: ['features_overview'],
  },
  'digital-business-card': {
    id: 'digital-business-card',
    label: 'Public tutor page and digital business card',
    areaId: 'tutor_workspace',
    aliases: ['digital business card', 'public tutor page', 'booking page', 'skaitmeninė vizitinė', 'viešas korepetitoriaus puslapis', 'wizytówka cyfrowa', 'publiczna strona korepetytora'],
    facts: [
      'A tutor can publish one page with their introduction, subjects, lesson formats, public prices, reviews, and selected live availability.',
      'A visitor selects a lesson and time and sends a booking request; the tutor confirms the new student before it becomes a scheduled lesson.',
      'The same public link can be shared in social profiles, ads, messages, email signatures, or QR codes.',
    ],
    suggestedPageIds: ['digital_business_card'],
    deepFeaturePageId: 'digital-business-card',
  },
  cancellation: {
    id: 'cancellation',
    label: 'Cancellation rules and late-cancellation fees',
    areaId: 'tutor_workspace',
    aliases: ['cancellation', 'late cancellation', 'cancellation fee', 'atšaukimas', 'vėlyvas atšaukimas', 'atšaukimo mokestis', 'odwołanie', 'późne odwołanie', 'opłata za odwołanie'],
    facts: [
      'Tutors and organizations can configure cancellation deadlines and late-cancellation fee rules in lesson settings.',
      'Students see applicable cancellation terms during booking, and a cancelled time can be offered through the waitlist flow.',
      'Refund handling still depends on the payment state and the tutor or organization policy.',
    ],
    suggestedPageIds: ['cancellation'],
    deepFeaturePageId: 'cancellation',
  },
  comments: {
    id: 'comments',
    label: 'Lesson notes, comments, and shared progress',
    areaId: 'integrations_messages',
    aliases: ['lesson note', 'comment', 'progress note', 'pamokos komentaras', 'pastaba', 'pažanga', 'notatka z lekcji', 'komentarz', 'postęp'],
    facts: [
      'Tutors can add notes and comments to individual lessons so student progress and next steps stay connected to lesson history.',
      'A note can remain private to the tutor or be shared with the student and parent according to the selected visibility.',
      'Files and homework can be attached alongside lesson notes.',
    ],
    suggestedPageIds: ['comments'],
    deepFeaturePageId: 'comments',
  },
} as const satisfies Record<PublicProductFeatureId, PublicProductFeatureKnowledge>;

export function normalizeProductSearchValue(value: string): string {
  return value
    .toLocaleLowerCase('en')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const PRODUCT_SEARCH_STOP_WORDS = new Set([
  'the', 'and', 'are', 'can', 'could', 'does', 'feature', 'features', 'for', 'from',
  'has', 'have', 'how', 'our', 'software', 'support', 'system', 'that', 'this', 'tutlio',
  'what', 'when', 'where', 'with', 'you', 'your',
  'kaip', 'gali', 'galite', 'funkcija', 'funkcijos', 'musu', 'sistema', 'turite', 'yra', 'jusu',
  'czy', 'funkcja', 'funkcje', 'jak', 'jest', 'macie', 'moze', 'system', 'wasz',
]);

export function productSearchTokens(value: string): string[] {
  return normalizeProductSearchValue(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !PRODUCT_SEARCH_STOP_WORDS.has(token));
}

export function parsePublicProductFeatureIds(value: unknown): PublicProductFeatureId[] {
  const candidates = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const seen = new Set<PublicProductFeatureId>();

  for (const candidate of candidates) {
    const id = typeof candidate === 'string' ? candidate.trim() : '';
    if (PUBLIC_PRODUCT_FEATURE_IDS.includes(id as PublicProductFeatureId)) {
      seen.add(id as PublicProductFeatureId);
    }
    if (seen.size === 3) break;
  }

  return [...seen];
}

/** Free multilingual fallback used when the semantic selector is unavailable. */
export function rankPublicProductFeatures(query: string, limit = 3): PublicProductFeatureId[] {
  const normalizedQuery = normalizeProductSearchValue(query);
  const queryTokens = new Set(productSearchTokens(query));
  if (!normalizedQuery || queryTokens.size === 0) return [];

  return PUBLIC_PRODUCT_FEATURE_IDS
    .map((id, order) => {
      const feature = PUBLIC_PRODUCT_FEATURES[id];
      const normalizedAliases = [feature.id, feature.label, ...feature.aliases]
        .map(normalizeProductSearchValue)
        .filter(Boolean);
      const factTokens = new Set(productSearchTokens(feature.facts.join(' ')));
      let score = 0;

      for (const alias of normalizedAliases) {
        if (normalizedQuery.includes(alias)) score += alias.includes(' ') ? 12 : 8;
      }
      for (const token of queryTokens) {
        if (normalizedAliases.some((alias) => alias.split(' ').includes(token))) score += 4;
        else if (factTokens.has(token)) score += 1;
      }

      return { id, score, order };
    })
    // Require at least one alias/token match; generic words that happen to
    // appear in a fact must not manufacture a feature recommendation.
    .filter(({ score }) => score >= 4)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, Math.max(0, limit))
    .map(({ id }) => id);
}

export function productFeatureRouterCatalog(): string {
  return PUBLIC_PRODUCT_FEATURE_IDS
    .map((id) => {
      const feature = PUBLIC_PRODUCT_FEATURES[id];
      return `- ${id}: ${feature.label}; area ${feature.areaId}; pages ${feature.suggestedPageIds.join(', ') || 'none'}; aliases ${feature.aliases.join(', ')}`;
    })
    .join('\n');
}
