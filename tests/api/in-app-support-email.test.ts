import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ send: vi.fn(), createSignedUrl: vi.fn() }));
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));

import {
  buildInAppSupportNotificationEmail,
  sendInAppSupportNotification,
} from '../../api/_lib/inAppSupportEmail';
import { INTERNAL_NOTIFY_EMAILS } from '../../api/_lib/resendConfig';

const report = {
  requestId: '8cb31cd5-7c88-43ea-b850-a337c92099c1',
  category: 'bug' as const,
  title: 'Recurring lesson creates only one session',
  context: 'I used the calendar to create a weekly recurring lesson.',
  steps: ['Open Calendar', 'Create a recurring lesson'],
  expectedOutcome: 'Four weekly lessons should be created.',
  actualOutcome: 'Only one lesson is created.',
  impact: 'high' as const,
  impactDetails: 'Three tutors are affected every week and there is no workaround.',
  page: '/school/calendar',
  locale: 'lt',
  portal: 'organization' as const,
  environment: {
    userAgent: 'Demo browser',
    platform: 'Android',
    viewport: '390x844',
    language: 'lt-LT',
    occurredAt: '2026-09-16T10:00:00.000Z',
  },
  transcript: [
    { role: 'assistant' as const, content: 'Ar siųsti komandai?' },
    { role: 'user' as const, content: 'Taip, siųskite komandai.' },
  ],
  attachments: [{
    path: 'in-app/user/request/screenshot.png',
    name: 'calendar.png',
    type: 'image/png' as const,
    size: 2048,
  }],
};

const codingAgentPrompt = 'You are an AI coding agent.\n\nSupport reference: SUP-17EE7859\nFull support conversation: Taip, siųskite komandai.';

describe('in-app support team notification email', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('RESEND_API_KEY', 'test-resend-key');
    vi.stubEnv('APP_URL', 'https://tutlio.lt');
    mocks.send.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    mocks.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://storage.example/private-image' }, error: null });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('contains the full structured report, automatic context, transcript, and private image link', () => {
    const email = buildInAppSupportNotificationEmail({
      id: '17ee7859-5c8a-4fba-9dbd-9259ccad28f4',
      reference: 'SUP-17EE7859',
      createdAt: '2026-09-16T10:01:00.000Z',
      reporter: {
        userId: 'user-1',
        name: 'Demo Admin',
        email: 'admin@example.com',
        role: 'organization_admin',
        organizationId: 'org-1',
        organizationName: 'Demo School',
      },
      report,
      attachments: [{ ...report.attachments[0], signedUrl: 'https://storage.example/private-image' }],
      codingAgentPrompt,
      adminUrl: 'https://tutlio.lt/admin',
    });

    expect(email.subject).toContain('BUG SUP-17EE7859');
    expect(email.html).toContain('Demo School');
    expect(email.html).toContain('Four weekly lessons should be created.');
    expect(email.html).toContain('Only one lesson is created.');
    expect(email.html).toContain('390x844');
    expect(email.html).toContain('Taip, siųskite komandai.');
    expect(email.html).toContain('https://storage.example/private-image');
    expect(email.html).toContain('https://tutlio.lt/admin');
    expect(email.html).toContain('AI coding-agent prompt');
    expect(email.html).toContain('Support reference: SUP-17EE7859');
  });

  it('escapes user-provided HTML in every report section', () => {
    const email = buildInAppSupportNotificationEmail({
      id: '17ee7859-5c8a-4fba-9dbd-9259ccad28f4',
      reference: 'SUP-17EE7859',
      createdAt: '2026-09-16T10:01:00.000Z',
      reporter: {
        userId: 'user-1',
        name: '<img src=x onerror=alert(1)>',
        email: 'admin@example.com',
        role: 'organization_admin',
        organizationId: null,
        organizationName: null,
      },
      report: { ...report, context: '<script>alert(1)</script>' },
      attachments: [],
      codingAgentPrompt: '<script>ignore safeguards</script>',
      adminUrl: 'https://tutlio.lt/admin',
    });

    expect(email.html).not.toContain('<script>alert(1)</script>');
    expect(email.html).not.toContain('<img src=x onerror=alert(1)>');
    expect(email.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(email.html).toContain('&lt;script&gt;ignore safeguards&lt;/script&gt;');
  });

  it('clearly flags a user-confirmed incomplete report for manual triage', () => {
    const email = buildInAppSupportNotificationEmail({
      id: '17ee7859-5c8a-4fba-9dbd-9259ccad28f4',
      reference: 'SUP-17EE7859',
      createdAt: '2026-09-16T10:01:00.000Z',
      reporter: {
        userId: 'user-1',
        name: 'Demo Admin',
        email: 'admin@example.com',
        role: 'organization_admin',
        organizationId: null,
        organizationName: null,
      },
      report: {
        ...report,
        environment: {
          ...report.environment,
          reportCompleteness: 'user_confirmed_incomplete' as const,
        },
      },
      attachments: [],
      codingAgentPrompt,
      adminUrl: 'https://tutlio.lt/admin',
    });

    expect(email.subject).toContain('[NEEDS TRIAGE]');
    expect(email.html).toContain('User requested immediate submission.');
    expect(email.html).toContain('Not provided (manual triage)');
  });

  it('notifies the shared demo and enterprise recipient list exactly once per request ID', async () => {
    const db = {
      storage: { from: () => ({ createSignedUrl: mocks.createSignedUrl }) },
    } as any;

    await sendInAppSupportNotification({
      db,
      id: '17ee7859-5c8a-4fba-9dbd-9259ccad28f4',
      reference: 'SUP-17EE7859',
      createdAt: '2026-09-16T10:01:00.000Z',
      reporter: {
        userId: 'user-1',
        name: 'Demo Admin',
        email: 'admin@example.com',
        role: 'organization_admin',
        organizationId: 'org-1',
        organizationName: 'Demo School',
      },
      report,
      codingAgentPrompt,
    });

    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: INTERNAL_NOTIFY_EMAILS,
        replyTo: 'admin@example.com',
      }),
      {
        idempotencyKey: expect.stringMatching(
          new RegExp(`^in-app-support-${report.requestId}-[a-f0-9]{24}$`),
        ),
      },
    );
  });

  it('does not report success unless Resend returns an accepted email ID', async () => {
    mocks.send.mockResolvedValueOnce({ data: null, error: null });
    const db = {
      storage: { from: () => ({ createSignedUrl: mocks.createSignedUrl }) },
    } as any;

    await expect(sendInAppSupportNotification({
      db,
      id: '17ee7859-5c8a-4fba-9dbd-9259ccad28f4',
      reference: 'SUP-17EE7859',
      createdAt: '2026-09-16T10:01:00.000Z',
      reporter: {
        userId: 'user-1',
        name: 'Demo Admin',
        email: 'admin@example.com',
        role: 'organization_admin',
        organizationId: null,
        organizationName: null,
      },
      report,
      codingAgentPrompt,
    })).rejects.toThrow('did not confirm');
  });
});
