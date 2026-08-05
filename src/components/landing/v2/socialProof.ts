/**
 * Social-proof content for the landing page.
 *
 * All three blocks below are EMPTY on purpose. Their sections early-return
 * `null`, so nothing renders in production until real, attributable content is
 * dropped in here. Do not ship invented customers, quotes or metrics — they
 * would read as genuine reviews on a live commercial site.
 *
 * To preview the layouts locally, flip SHOW_PLACEHOLDER_SOCIAL_PROOF to true.
 * It is deliberately a plain constant so a stray `true` shows up in review.
 */
export const SHOW_PLACEHOLDER_SOCIAL_PROOF = true;

/** YouTube video id for the product demo, e.g. 'dQw4w9WgXcQ'. Empty = section hidden. */
export const DEMO_VIDEO_ID = '';

/** Length label shown next to the play button once a video id is set. */
export const DEMO_VIDEO_LENGTH = '2 min';

/**
 * A quote rendered as runs, so the customer's own key phrases can be bolded
 * without putting markup in the string.
 */
export interface QuoteRun {
  text: string;
  emphasis?: boolean;
}

export interface CaseStudy {
  /** Organisation name, exactly as they want to be credited. */
  org: string;
  /** Headline for the section — the outcome, in the customer's framing. */
  headline: string;
  /** Path under /public for their logo, or null to show the name as text. */
  logo: string | null;
  /** Two headline metrics. Only use numbers the customer has confirmed. */
  stats: { value: string; label: string }[];
  quote: QuoteRun[];
  authorName: string;
  authorRole: string;
  authorPhoto: string | null;
  /** Full profile URL, or null to omit the icon. */
  authorLinkedIn: string | null;
}

export const CASE_STUDY: CaseStudy | null = null;

export interface Testimonial {
  name: string;
  role: string;
  quote: string;
  photo: string | null;
  /** Whole stars out of 5. */
  rating: number;
}

export const TESTIMONIALS: Testimonial[] = [];

/* ---------------------------------------------------------------------------
 * Placeholder content — layout preview only, never rendered unless
 * SHOW_PLACEHOLDER_SOCIAL_PROOF is true. Bracketed so it can never be mistaken
 * for real copy.
 * ------------------------------------------------------------------------- */

export const PLACEHOLDER_CASE_STUDY: CaseStudy = {
  org: '[Customer name]',
  headline: '[Headline — the outcome this customer got, in one sentence]',
  logo: null,
  stats: [
    { value: 'XX%', label: '[metric one]' },
    { value: 'Nx', label: '[metric two]' },
  ],
  quote: [
    { text: '[Placeholder — replace with a real customer quote before launch. ' },
    { text: 'Key phrases render bold', emphasis: true },
    { text: ' so the outcome stands out. Two to four sentences: the problem they had, what changed, the result.]' },
  ],
  authorName: '[Name]',
  authorRole: '[Role, organisation]',
  authorPhoto: null,
  authorLinkedIn: null,
};

const PLACEHOLDER_QUOTE = '[Placeholder testimonial — replace before launch.]';

export const PLACEHOLDER_TESTIMONIALS: Testimonial[] = [
  { name: '[Name 1]', role: '[Role, school]', quote: PLACEHOLDER_QUOTE, photo: null, rating: 5 },
  { name: '[Name 2]', role: '[Role, school]', quote: PLACEHOLDER_QUOTE, photo: null, rating: 5 },
  { name: '[Name 3]', role: '[Role, school]', quote: PLACEHOLDER_QUOTE, photo: null, rating: 5 },
  { name: '[Name 4]', role: '[Role, school]', quote: PLACEHOLDER_QUOTE, photo: null, rating: 4 },
  { name: '[Name 5]', role: '[Role, school]', quote: PLACEHOLDER_QUOTE, photo: null, rating: 5 },
];
