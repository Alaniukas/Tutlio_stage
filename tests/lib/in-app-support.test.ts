import { describe, expect, it } from 'vitest';
import {
  parseInAppSupportAiReview,
  parseInAppSupportSubmission,
  supportHomeForPath,
  supportPageForPath,
  supportPortalForPath,
} from '@/lib/inAppSupport';

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
