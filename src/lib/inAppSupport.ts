export const IN_APP_SUPPORT_MAX_ATTACHMENTS = 5;
export const IN_APP_SUPPORT_MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const IN_APP_SUPPORT_ATTACHMENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export type InAppSupportCategory = 'bug' | 'feature';
export type InAppSupportImpact = 'blocking' | 'high' | 'medium' | 'low';
export type InAppSupportPortal = 'tutor' | 'organization' | 'student' | 'parent';
export type InAppSupportStatus = 'new' | 'in_review' | 'planned' | 'resolved' | 'closed';
export type InAppSupportPriority = 'untriaged' | 'low' | 'medium' | 'high' | 'urgent';

const SUPPORT_NAV_LABELS = {
  en: 'Support agent',
  lt: 'Pagalbos agentas',
  pl: 'Agent pomocy',
} as const;

export function inAppSupportLabel(locale: string): string {
  const language = locale === 'lt' || locale === 'pl' ? locale : 'en';
  return SUPPORT_NAV_LABELS[language];
}

export interface InAppSupportAttachment {
  path: string;
  name: string;
  type: (typeof IN_APP_SUPPORT_ATTACHMENT_TYPES)[number];
  size: number;
}

export interface InAppSupportTranscriptMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface InAppSupportAiReview {
  summary: string;
  ready: boolean;
  questions: string[];
}

export interface InAppSupportEnvironment {
  userAgent: string;
  platform: string;
  viewport: string;
  language: string;
  occurredAt: string;
}

export interface InAppSupportSubmission {
  requestId: string;
  category: InAppSupportCategory;
  title: string;
  context: string;
  steps: string[];
  expectedOutcome: string;
  actualOutcome: string | null;
  impact: InAppSupportImpact;
  impactDetails: string;
  page: string;
  locale: string;
  portal: InAppSupportPortal;
  environment: InAppSupportEnvironment;
  transcript: InAppSupportTranscriptMessage[];
  attachments: InAppSupportAttachment[];
}

function text(value: unknown, max: number): string {
  return String(value ?? '').trim().slice(0, max);
}

function isAttachmentType(value: string): value is InAppSupportAttachment['type'] {
  return IN_APP_SUPPORT_ATTACHMENT_TYPES.includes(value as InAppSupportAttachment['type']);
}

export function parseInAppSupportAiReview(value: unknown): InAppSupportAiReview | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const summary = text(raw.summary, 600);
  const ready = typeof raw.ready === 'boolean' ? raw.ready : null;
  const questions = Array.isArray(raw.questions)
    ? raw.questions.map((item) => text(item, 240)).filter(Boolean).slice(0, 3)
    : [];

  if (summary.length < 3 || ready === null) return null;
  return { summary, ready, questions };
}

export function parseInAppSupportSubmission(value: unknown): InAppSupportSubmission | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const requestId = text(raw.requestId, 100);
  const category = raw.category === 'bug' || raw.category === 'feature' ? raw.category : null;
  const title = text(raw.title, 180);
  const context = text(raw.context, 4_000);
  const expectedOutcome = text(raw.expectedOutcome, 4_000);
  const actualRaw = text(raw.actualOutcome, 4_000);
  const actualOutcome = category === 'feature' ? null : actualRaw;
  const impact = ['blocking', 'high', 'medium', 'low'].includes(String(raw.impact))
    ? raw.impact as InAppSupportImpact
    : null;
  const impactDetails = text(raw.impactDetails, 2_000);
  const page = text(raw.page, 300) || '/';
  const locale = text(raw.locale, 12) || 'en';
  const portal = ['tutor', 'organization', 'student', 'parent'].includes(String(raw.portal))
    ? raw.portal as InAppSupportPortal
    : null;

  const steps = Array.isArray(raw.steps)
    ? raw.steps.map((item) => text(item, 500)).filter(Boolean).slice(0, 12)
    : [];

  const rawEnvironment = raw.environment && typeof raw.environment === 'object' && !Array.isArray(raw.environment)
    ? raw.environment as Record<string, unknown>
    : {};
  const environment: InAppSupportEnvironment = {
    userAgent: text(rawEnvironment.userAgent, 500),
    platform: text(rawEnvironment.platform, 100),
    viewport: text(rawEnvironment.viewport, 50),
    language: text(rawEnvironment.language, 30),
    occurredAt: text(rawEnvironment.occurredAt, 40),
  };

  const transcript = Array.isArray(raw.transcript)
    ? raw.transcript
      .map((item): InAppSupportTranscriptMessage | null => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const message = item as Record<string, unknown>;
        const role = message.role === 'user' || message.role === 'assistant' ? message.role : null;
        const content = text(message.content, 2_000);
        return role && content ? { role, content } : null;
      })
      .filter((item): item is InAppSupportTranscriptMessage => Boolean(item))
      .slice(-30)
    : [];

  const attachments = Array.isArray(raw.attachments)
    ? raw.attachments
      .map((item): InAppSupportAttachment | null => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
        const attachment = item as Record<string, unknown>;
        const path = text(attachment.path, 500);
        const name = text(attachment.name, 180);
        const type = text(attachment.type, 100);
        const size = Number(attachment.size);
        if (!path || !name || !isAttachmentType(type) || !Number.isInteger(size)
          || size < 1 || size > IN_APP_SUPPORT_MAX_ATTACHMENT_BYTES) return null;
        return { path, name, type, size };
      })
      .filter((item): item is InAppSupportAttachment => Boolean(item))
      .slice(0, IN_APP_SUPPORT_MAX_ATTACHMENTS)
    : [];

  if (!/^[a-zA-Z0-9._:-]{8,100}$/.test(requestId)
    || !category
    || title.length < 5
    || context.length < 10
    || steps.length === 0
    || expectedOutcome.length < 5
    || (category === 'bug' && (!actualOutcome || actualOutcome.length < 5))
    || !impact
    || impactDetails.length < 3
    || !portal) {
    return null;
  }

  return {
    requestId,
    category,
    title,
    context,
    steps,
    expectedOutcome,
    actualOutcome,
    impact,
    impactDetails,
    page,
    locale,
    portal,
    environment,
    transcript,
    attachments,
  };
}

export function supportPortalForPath(pathname: string): InAppSupportPortal {
  if (pathname === '/student' || pathname.startsWith('/student/')) return 'student';
  if (pathname === '/parent' || pathname.startsWith('/parent/')) return 'parent';
  if (pathname === '/company' || pathname.startsWith('/company/')
    || pathname === '/school' || pathname.startsWith('/school/')) return 'organization';
  return 'tutor';
}

export function supportPageForPath(pathname: string): string {
  if (pathname === '/student' || pathname.startsWith('/student/')) return '/student/support';
  if (pathname === '/parent' || pathname.startsWith('/parent/')) return '/parent/support';
  if (pathname === '/company' || pathname.startsWith('/company/')) return '/company/support';
  if (pathname === '/school' || pathname.startsWith('/school/')) return '/school/support';
  return '/support';
}

export function supportHomeForPath(pathname: string): string {
  if (pathname === '/student' || pathname.startsWith('/student/')) return '/student';
  if (pathname === '/parent' || pathname.startsWith('/parent/')) return '/parent';
  if (pathname === '/company' || pathname.startsWith('/company/')) return '/company';
  if (pathname === '/school' || pathname.startsWith('/school/')) return '/school';
  return '/dashboard';
}
