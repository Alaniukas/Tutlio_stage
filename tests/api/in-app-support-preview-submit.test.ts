import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyRequestAuth: vi.fn(),
  verifyAttachments: vi.fn(),
  resolveReporter: vi.fn(),
  sendNotification: vi.fn(),
  insert: vi.fn(),
}));

vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: mocks.verifyRequestAuth }));
vi.mock('../../api/_lib/supportRequest.js', () => ({ allowSupportRequest: () => true }));
vi.mock('../../api/_lib/inAppSupport.js', () => ({
  resolveInAppSupportReporter: mocks.resolveReporter,
  verifyInAppSupportAttachments: mocks.verifyAttachments,
}));
vi.mock('../../api/_lib/inAppSupportEmail.js', () => ({
  sendInAppSupportNotification: mocks.sendNotification,
}));

const db = {
  from: vi.fn(),
};

vi.mock('../../api/_lib/supportPersistence.js', () => ({
  getSupportServiceClient: () => db,
}));

import handler from '../../api/in-app-support';
import { INTERNAL_NOTIFY_EMAILS } from '../../api/_lib/resendConfig';

function response() {
  const result = { statusCode: 200, body: null as unknown };
  return {
    result,
    res: {
      setHeader: vi.fn(),
      status(code: number) {
        result.statusCode = code;
        return this;
      },
      json(body: unknown) {
        result.body = body;
        return this;
      },
    },
  };
}

const report = {
  requestId: '8cb31cd5-7c88-43ea-b850-a337c92099c1',
  category: 'feature',
  title: 'Generate and grade tests with AI',
  context: 'Teachers currently create and manage every test manually.',
  steps: ['Open the tests area', 'Ask AI to generate a test', 'Review and publish it'],
  expectedOutcome: 'AI should generate questions, grade answers, and provide feedback.',
  actualOutcome: null,
  impact: 'high',
  impactDetails: 'Each teacher spends around 10 hours per day on this work.',
  page: '/preview/support-agent',
  locale: 'en',
  portal: 'tutor',
  environment: {
    userAgent: 'Local preview browser',
    platform: 'Windows',
    viewport: '390x844',
    language: 'en-US',
    occurredAt: '2026-09-16T10:00:00.000Z',
  },
  transcript: [
    { role: 'assistant', content: 'Say “send it” when ready.' },
    { role: 'user', content: 'send it' },
  ],
  attachments: [],
};

describe('local support preview submission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VERCEL_ENV', 'development');
    mocks.verifyAttachments.mockResolvedValue([]);
    mocks.sendNotification.mockResolvedValue('email-preview-1');

    const chain: any = {};
    chain.select = vi.fn(() => chain);
    chain.eq = vi.fn(() => chain);
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    chain.single = vi.fn().mockResolvedValue({
      data: {
        id: '17ee7859-5c8a-4fba-9dbd-9259ccad28f4',
        status: 'new',
        created_at: '2026-09-16T10:01:00.000Z',
      },
      error: null,
    });
    mocks.insert.mockImplementation(() => chain);
    db.from.mockReturnValue({ ...chain, insert: mocks.insert, update: vi.fn(() => chain) });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('persists preview context and emails the real internal recipient list', async () => {
    const { res, result } = response();
    await handler({
      method: 'POST',
      headers: { 'x-in-app-support-preview': '1' },
      body: report,
    } as any, res as any);

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ notificationSent: true });
    expect((result.body as { reference: string }).reference).toMatch(/^SUP-[A-F0-9]{8}$/);
    expect(mocks.verifyRequestAuth).not.toHaveBeenCalled();
    expect(mocks.resolveReporter).not.toHaveBeenCalled();
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      reporter_user_id: null,
      reporter_email: INTERNAL_NOTIFY_EMAILS[0],
      title: report.title,
      context: report.context,
      transcript: report.transcript,
      coding_agent_prompt: expect.stringContaining('Structured submission type: Feature request'),
    }));
    expect(mocks.sendNotification).toHaveBeenCalledWith(expect.objectContaining({
      reporter: expect.objectContaining({ email: INTERNAL_NOTIFY_EMAILS[0] }),
      report: expect.objectContaining({ context: report.context, transcript: report.transcript }),
      codingAgentPrompt: expect.stringContaining('Full support conversation'),
    }));
  });
});
