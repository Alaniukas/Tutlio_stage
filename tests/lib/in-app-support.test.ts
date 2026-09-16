import { describe, expect, it } from 'vitest';
import {
  inAppSupportDraftMissingFields,
  isInAppSupportSendCommand,
  isInAppSupportDraftComplete,
  normalizeInAppSupportAgentReply,
  prepareInAppSupportDraftForSubmission,
  parseInAppSupportAiConversation,
  parseInAppSupportAiIntake,
  parseInAppSupportAiReview,
  parseInAppSupportSubmission,
  supportHomeForPath,
  supportPageForPath,
  supportPortalForPath,
} from '@/lib/inAppSupport';

describe('in-app support conversational agent output', () => {
  it('removes em dashes from agent-authored replies', () => {
    const reply = normalizeInAppSupportAgentReply('Thanks—that explains it — I can help.');
    expect(reply).toBe('Thanks - that explains it - I can help.');
    expect(reply).not.toContain('—');
  });

  it('keeps an actionable evolving report and readiness decision', () => {
    expect(parseInAppSupportAiConversation({
      reply: 'I have enough detail now. Type “send it” when you want me to notify the team.',
      title: 'Recurring lesson creates only one session',
      context: 'An organization administrator creates a weekly recurring lesson from the calendar.',
      steps: ['Open Calendar', 'Create a weekly recurring lesson', 'Save it'],
      expectedOutcome: 'All weekly lessons should be created.',
      actualOutcome: 'Only the first lesson is created.',
      impact: 'high',
      impactDetails: 'Three tutors are affected every week and there is no workaround.',
      ready: true,
      missingTopics: [],
    })?.ready).toBe(true);
  });

  it('keeps the model readiness signal separate from deterministic submission validation', () => {
    const parsed = parseInAppSupportAiConversation({
      reply: 'Which action caused the message to appear?',
      title: 'Unexpected message',
      context: 'A message appeared.',
      steps: [],
      expectedOutcome: '',
      actualOutcome: 'Unexpected message appeared.',
      impact: 'high',
      impactDetails: '',
      ready: true,
      missingTopics: ['triggering action'],
    });

    expect(parsed?.ready).toBe(true);
    expect(isInAppSupportDraftComplete('bug', parsed!)).toBe(false);
    expect(inAppSupportDraftMissingFields('bug', parsed!)).toEqual([
      'steps',
      'expectedOutcome',
      'impactDetails',
    ]);
  });

  it('does not require bug-style reproduction steps for a feature idea', () => {
    const draft = {
      title: 'AI generated tests',
      context: 'Teachers want Tutlio to help create and manage tests.',
      steps: [],
      expectedOutcome: 'Tutlio should generate a test from teacher instructions.',
      actualOutcome: '',
      impact: 'medium' as const,
      impactDetails: 'Teachers would use it every week.',
    };

    expect(inAppSupportDraftMissingFields('feature', draft)).toEqual([]);
    expect(isInAppSupportDraftComplete('feature', draft)).toBe(true);
  });
});

describe('in-app support send confirmation', () => {
  it('accepts explicit send commands in supported languages', () => {
    expect(isInAppSupportSendCommand('Send it to the team')).toBe(true);
    expect(isInAppSupportSendCommand('Can you just send already?')).toBe(true);
    expect(isInAppSupportSendCommand('Please send it.')).toBe(true);
    expect(isInAppSupportSendCommand('Taip, siųskite komandai!')).toBe(true);
    expect(isInAppSupportSendCommand('siųsti, pridėk nuotraukas')).toBe(true);
    expect(isInAppSupportSendCommand('Wyślij to')).toBe(true);
  });

  it('does not treat vague confirmation as permission to submit', () => {
    expect(isInAppSupportSendCommand('yes')).toBe(false);
    expect(isInAppSupportSendCommand('looks good')).toBe(false);
    expect(isInAppSupportSendCommand('maybe later')).toBe(false);
  });

  it('prepares an explicitly submitted incomplete request without inventing user facts', () => {
    const prepared = prepareInAppSupportDraftForSubmission('feature', {
      title: 'Testų funkcija',
      context: 'Reikia testų funkcijos.',
      steps: [],
      expectedOutcome: '',
      actualOutcome: '',
      impact: null,
      impactDetails: '',
    }, [
      { role: 'user', content: 'hey, reikia testų' },
      { role: 'user', content: 'siųsti' },
    ]);

    expect(prepared.completeness).toBe('user_confirmed_incomplete');
    expect(prepared.draft.steps[0]).toContain('not provided');
    expect(prepared.draft.expectedOutcome).toContain('not specified');
    expect(prepared.draft.impactDetails).toContain('triage');
  });
});

describe('in-app support adaptive intake', () => {
  it('keeps extracted details and the next contextual question', () => {
    expect(parseInAppSupportAiIntake({
      acknowledgement: 'Supratau - iš kalendoriaus sukuriama tik viena pamoka.',
      title: 'Pasikartojanti pamoka sukuriama tik vieną kartą',
      context: 'Kuriant pasikartojančią pamoką iš kalendoriaus sukuriama tik viena.',
      steps: ['Atidaryti kalendorių', 'Kurti pasikartojančią pamoką'],
      expectedOutcome: '',
      actualOutcome: 'Sukuriama tik viena pamoka.',
      nextStage: 'expected',
      nextQuestion: 'Kiek pamokų turėjo būti sukurta?',
    })).toMatchObject({
      nextStage: 'expected',
      actualOutcome: 'Sukuriama tik viena pamoka.',
      steps: ['Atidaryti kalendorių', 'Kurti pasikartojančią pamoką'],
    });
  });

  it('rejects an intake answer without a usable follow-up', () => {
    expect(parseInAppSupportAiIntake({ acknowledgement: 'OK', nextStage: 'other', nextQuestion: '' })).toBeNull();
  });
});

describe('in-app support AI review', () => {
  it('keeps a concise structured review and at most three questions', () => {
    expect(parseInAppSupportAiReview({
      summary: 'The workflow is understandable, but the affected scope is missing.',
      ready: false,
      questions: ['How many users are affected?', 'Does it happen every time?', 'Is there a workaround?', 'Ignored question'],
    })).toEqual({
      summary: 'The workflow is understandable, but the affected scope is missing.',
      ready: false,
      questions: ['How many users are affected?', 'Does it happen every time?', 'Is there a workaround?'],
    });
  });

  it('rejects malformed AI review output', () => {
    expect(parseInAppSupportAiReview({ summary: '', ready: true, questions: [] })).toBeNull();
    expect(parseInAppSupportAiReview({ summary: 'Looks good', ready: 'yes', questions: [] })).toBeNull();
  });
});

const validReport = {
  requestId: '8cb31cd5-7c88-43ea-b850-a337c92099c1',
  category: 'bug',
  title: 'Invoice preview is blank',
  context: 'I opened a paid invoice from the tutor finance page.',
  steps: ['Open Finance', 'Select a paid invoice', 'Choose Download PDF'],
  expectedOutcome: 'The generated invoice PDF should open.',
  actualOutcome: 'A blank browser tab opens every time.',
  impact: 'high',
  impactDetails: 'All invoices are affected and there is no workaround.',
  page: '/finance?tab=invoices',
  locale: 'en',
  portal: 'tutor',
  environment: {
    userAgent: 'Test browser',
    platform: 'Windows',
    viewport: '1440x900',
    language: 'en-US',
    occurredAt: '2026-09-16T10:00:00.000Z',
  },
  transcript: [
    { role: 'assistant', content: 'What happened?' },
    { role: 'user', content: 'The invoice preview is blank.' },
  ],
  attachments: [{
    path: 'in-app/user/report/image.png',
    name: 'invoice.png',
    type: 'image/png',
    size: 1234,
  }],
};

describe('in-app support submissions', () => {
  it('normalizes a complete bug report', () => {
    const parsed = parseInAppSupportSubmission(validReport);

    expect(parsed).toMatchObject({
      category: 'bug',
      title: 'Invoice preview is blank',
      impact: 'high',
      actualOutcome: 'A blank browser tab opens every time.',
    });
    expect(parsed?.steps).toHaveLength(3);
    expect(parsed?.attachments).toHaveLength(1);
  });

  it('allows a feature report without an actual-outcome field', () => {
    const parsed = parseInAppSupportSubmission({
      ...validReport,
      category: 'feature',
      title: 'Let parents reschedule from reminder emails',
      actualOutcome: '',
      portal: 'organization',
    });

    expect(parsed?.category).toBe('feature');
    expect(parsed?.actualOutcome).toBeNull();
  });

  it('rejects incomplete and unsafe attachment metadata', () => {
    expect(parseInAppSupportSubmission({ ...validReport, steps: [] })).toBeNull();
    expect(parseInAppSupportSubmission({
      ...validReport,
      attachments: [{ ...validReport.attachments[0], type: 'image/svg+xml' }],
    })?.attachments).toEqual([]);
  });

  it('accepts multiple images and caps a report at five attachments', () => {
    const attachments = Array.from({ length: 6 }, (_, index) => ({
      path: `in-app/user/report/image-${index + 1}.png`,
      name: `screen-${index + 1}.png`,
      type: 'image/png',
      size: 1_000 + index,
    }));

    const parsed = parseInAppSupportSubmission({ ...validReport, attachments });

    expect(parsed?.attachments).toHaveLength(5);
    expect(parsed?.attachments.map(({ name }) => name)).toEqual([
      'screen-1.png',
      'screen-2.png',
      'screen-3.png',
      'screen-4.png',
      'screen-5.png',
    ]);
  });
});

describe('support portal context', () => {
  it('maps protected routes to the reporter portal', () => {
    expect(supportPortalForPath('/school/contracts')).toBe('organization');
    expect(supportPortalForPath('/company/students')).toBe('organization');
    expect(supportPortalForPath('/student/sessions')).toBe('student');
    expect(supportPortalForPath('/parent/invoices')).toBe('parent');
    expect(supportPortalForPath('/calendar')).toBe('tutor');
  });

  it('maps each portal to its support page and dashboard home', () => {
    expect(supportPageForPath('/school/contracts')).toBe('/school/support');
    expect(supportPageForPath('/company/students')).toBe('/company/support');
    expect(supportPageForPath('/student/sessions')).toBe('/student/support');
    expect(supportPageForPath('/parent/invoices')).toBe('/parent/support');
    expect(supportPageForPath('/calendar')).toBe('/support');
    expect(supportHomeForPath('/school/support')).toBe('/school');
    expect(supportHomeForPath('/student/support')).toBe('/student');
  });
});
