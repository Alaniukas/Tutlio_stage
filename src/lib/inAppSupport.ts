export const IN_APP_SUPPORT_MAX_ATTACHMENTS = 5;
export const IN_APP_SUPPORT_MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const IN_APP_SUPPORT_ATTACHMENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export type InAppSupportCategory = 'bug' | 'feature';
export type InAppSupportImpact = 'blocking' | 'high' | 'medium' | 'low';
export type InAppSupportPortal = 'tutor' | 'organization' | 'student' | 'parent';
export type InAppSupportStatus = 'new' | 'in_review' | 'planned' | 'resolved' | 'closed';
export type InAppSupportPriority = 'untriaged' | 'low' | 'medium' | 'high' | 'urgent';
export type InAppSupportReportCompleteness = 'complete' | 'user_confirmed_incomplete';

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

export type InAppSupportIntakeStage = 'steps' | 'expected' | 'actual' | 'impact';

export interface InAppSupportAiIntake {
  acknowledgement: string;
  title: string;
  context: string;
  steps: string[];
  expectedOutcome: string;
  actualOutcome: string;
  nextStage: InAppSupportIntakeStage;
  nextQuestion: string;
}

export interface InAppSupportAiConversation {
  reply: string;
  title: string;
  context: string;
  steps: string[];
  expectedOutcome: string;
  actualOutcome: string;
  impact: InAppSupportImpact | null;
  impactDetails: string;
  ready: boolean;
  missingTopics: InAppSupportDraftField[];
}

export type InAppSupportDraftField =
  | 'title'
  | 'context'
  | 'steps'
  | 'expectedOutcome'
  | 'actualOutcome'
  | 'impact'
  | 'impactDetails';

export type InAppSupportDraftFields = Pick<
  InAppSupportAiConversation,
  'title' | 'context' | 'steps' | 'expectedOutcome' | 'actualOutcome' | 'impact' | 'impactDetails'
>;

export interface InAppSupportEnvironment {
  userAgent: string;
  platform: string;
  viewport: string;
  language: string;
  occurredAt: string;
  reportCompleteness?: InAppSupportReportCompleteness;
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

/** Keeps the agent's own copy aligned with Tutlio's punctuation style. */
export function normalizeInAppSupportAgentReply(value: string): string {
  return value
    .replace(/\s*—\s*/g, ' - ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
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

export function parseInAppSupportAiIntake(value: unknown): InAppSupportAiIntake | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const acknowledgement = text(raw.acknowledgement, 240);
  const title = text(raw.title, 180);
  const context = text(raw.context, 4_000);
  const steps = Array.isArray(raw.steps)
    ? raw.steps.map((item) => text(item, 500)).filter(Boolean).slice(0, 12)
    : [];
  const expectedOutcome = text(raw.expectedOutcome, 4_000);
  const actualOutcome = text(raw.actualOutcome, 4_000);
  const nextStage = ['steps', 'expected', 'actual', 'impact'].includes(String(raw.nextStage))
    ? raw.nextStage as InAppSupportIntakeStage
    : null;
  const nextQuestion = text(raw.nextQuestion, 320);

  if (acknowledgement.length < 3 || !nextStage || nextQuestion.length < 3) return null;
  return {
    acknowledgement,
    title,
    context,
    steps,
    expectedOutcome,
    actualOutcome,
    nextStage,
    nextQuestion,
  };
}

export function parseInAppSupportAiConversation(value: unknown): InAppSupportAiConversation | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const reply = text(raw.reply, 800);
  const title = text(raw.title, 180);
  const context = text(raw.context, 4_000);
  const steps = Array.isArray(raw.steps)
    ? raw.steps.map((item) => text(item, 500)).filter(Boolean).slice(0, 12)
    : [];
  const expectedOutcome = text(raw.expectedOutcome, 4_000);
  const actualOutcome = text(raw.actualOutcome, 4_000);
  const impact = ['blocking', 'high', 'medium', 'low'].includes(String(raw.impact))
    ? raw.impact as InAppSupportImpact
    : null;
  const impactDetails = text(raw.impactDetails, 2_000);
  const ready = raw.ready === true;
  const missingTopics = Array.isArray(raw.missingTopics)
    ? raw.missingTopics
      .map((item) => text(item, 120))
      .filter((item): item is InAppSupportDraftField => [
        'title',
        'context',
        'steps',
        'expectedOutcome',
        'actualOutcome',
        'impact',
        'impactDetails',
      ].includes(item))
      .slice(0, 1)
    : [];
  if (reply.length < 3 || typeof raw.ready !== 'boolean') return null;

  return {
    reply,
    title,
    context,
    steps,
    expectedOutcome,
    actualOutcome,
    impact,
    impactDetails,
    ready,
    missingTopics,
  };
}

export function inAppSupportDraftMissingFields(
  category: InAppSupportCategory,
  draft: InAppSupportDraftFields,
): InAppSupportDraftField[] {
  const missing: InAppSupportDraftField[] = [];
  if (draft.title.trim().length < 5) missing.push('title');
  if (draft.context.trim().length < 10) missing.push('context');
  if (category === 'bug' && draft.steps.length === 0) missing.push('steps');
  if (draft.expectedOutcome.trim().length < 5) missing.push('expectedOutcome');
  if (category === 'bug' && draft.actualOutcome.trim().length < 5) missing.push('actualOutcome');
  if (!draft.impact) missing.push('impact');
  if (draft.impactDetails.trim().length < 3) missing.push('impactDetails');
  return missing;
}

export function isInAppSupportDraftComplete(
  category: InAppSupportCategory,
  draft: InAppSupportDraftFields,
): boolean {
  return inAppSupportDraftMissingFields(category, draft).length === 0;
}

/**
 * Picks the most useful deterministic fallback topic when the model marks a
 * report ready before the required evidence exists. The model may still ask a
 * different missing topic when the conversation makes it more natural, but a
 * generated title is deliberately last so the user is not asked to do the
 * agent's summarization work.
 */
export function nextInAppSupportQuestionField(
  category: InAppSupportCategory,
  draft: InAppSupportDraftFields,
): InAppSupportDraftField | null {
  const missing = new Set(inAppSupportDraftMissingFields(category, draft));
  const priority: InAppSupportDraftField[] = category === 'bug'
    ? ['actualOutcome', 'steps', 'expectedOutcome', 'context', 'impactDetails', 'impact', 'title']
    : ['expectedOutcome', 'context', 'impactDetails', 'impact', 'title'];
  return priority.find((field) => missing.has(field)) ?? null;
}

export function prepareInAppSupportDraftForSubmission(
  category: InAppSupportCategory,
  draft: InAppSupportDraftFields,
  transcript: InAppSupportTranscriptMessage[],
): {
  draft: InAppSupportDraftFields & { impact: InAppSupportImpact };
  completeness: InAppSupportReportCompleteness;
} {
  const completeness: InAppSupportReportCompleteness = isInAppSupportDraftComplete(category, draft)
    ? 'complete'
    : 'user_confirmed_incomplete';
  const lastUserDetail = [...transcript]
    .reverse()
    .find((message) => message.role === 'user' && !isInAppSupportSendCommand(message.content))
    ?.content.trim().slice(0, 4_000);
  const contextFallback = lastUserDetail && lastUserDetail.length >= 10
    ? lastUserDetail
    : `The user asked to submit this ${category === 'bug' ? 'bug report' : 'feature request'}. Review the conversation and screenshots.`;

  return {
    completeness,
    draft: {
      title: draft.title.trim().length >= 5
        ? draft.title
        : category === 'bug' ? 'Bug report from support chat' : 'Feature request from support chat',
      context: draft.context.trim().length >= 10 ? draft.context : contextFallback,
      steps: draft.steps.length > 0
        ? draft.steps
        : [category === 'feature' && draft.expectedOutcome.trim().length >= 5
          ? draft.expectedOutcome
          : category === 'bug'
            ? 'Reproduction steps were not provided before submission; review the conversation and screenshots.'
            : 'A desired workflow was not provided before submission; review the conversation and screenshots.'],
      expectedOutcome: draft.expectedOutcome.trim().length >= 5
        ? draft.expectedOutcome
        : 'The desired outcome was not specified before submission; review the conversation and screenshots.',
      actualOutcome: category === 'bug'
        ? (draft.actualOutcome.trim().length >= 5
          ? draft.actualOutcome
          : 'The exact observed result was not specified before submission; review the conversation and screenshots.')
        : '',
      impact: draft.impact || 'medium',
      impactDetails: draft.impactDetails.trim().length >= 3
        ? draft.impactDetails
        : 'The user did not specify impact; triage this request manually.',
    },
  };
}

const IN_APP_SUPPORT_SEND_COMMANDS = new Set([
  'send',
  'send it',
  'send this',
  'send to team',
  'send to the team',
  'send to the team for review',
  'send it to the team',
  'send this to the team',
  'submit',
  'submit it',
  'yes send',
  'yes send it',
  'just send it',
  'please send it',
  'send it already',
  'can you just send already',
  'can you send it already',
  'go ahead and send it',
  'siusti',
  'siusk',
  'siuskite',
  'siusti komandai',
  'siusti komandai perziureti',
  'siusk komandai',
  'siuskite komandai',
  'taip siusti',
  'taip siusk',
  'taip siuskite',
  'taip siusk komandai',
  'taip siuskite komandai',
  'wyslij',
  'wyslij to',
  'wyslij do zespolu',
  'wyslij zespolowi do sprawdzenia',
  'tak wyslij',
  'tak wyslij to',
]);

/** Requires an explicit localized send instruction; a vague "yes" never submits a report. */
export function isInAppSupportSendCommand(value: string): boolean {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (IN_APP_SUPPORT_SEND_COMMANDS.has(normalized)) return true;
  if (/^(prasau )?(siusk|siuskite|siusti)\b/.test(normalized)) return true;
  if (/^(prosze )?wyslij\b/.test(normalized)) return true;
  return /^(please )?(send|submit)( it| this| the report)?\b/.test(normalized);
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
    reportCompleteness: rawEnvironment.reportCompleteness === 'user_confirmed_incomplete'
      ? 'user_confirmed_incomplete'
      : 'complete',
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
