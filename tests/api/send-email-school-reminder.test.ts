// School parents get lesson reminders on the contract email without a Tutlio
// account: the school variant must lead with the join link and must not push
// them into the parent portal (or towards registering).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendMock, pushMock } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  pushMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock };
    constructor(_key: string) {}
  },
}));

vi.mock('../../api/_lib/sendPush', () => ({
  sendPushForEmail: pushMock,
}));

function mockRes() {
  const out: { statusCode: number; body: any } = { statusCode: 0, body: null };
  return {
    status(code: number) {
      out.statusCode = code;
      return this;
    },
    json(body: any) {
      out.body = body;
      return this;
    },
    setHeader() {
      return this;
    },
    getResult: () => out,
  };
}

function mockReq(body: unknown) {
  return {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', 'x-internal-key': 'service-key-test' },
    query: {},
  };
}

async function sendEmail(data: Record<string, unknown>) {
  const { default: handler } = await import('../../api/send-email');
  const res = mockRes();
  await handler(mockReq({ type: 'session_reminder_payer', to: 'parent@example.com', data, locale: 'lt' }) as any, res as any);
  expect(res.getResult().statusCode).toBe(200);
  expect(sendMock).toHaveBeenCalledTimes(1);
  return sendMock.mock.calls[0][0] as { subject: string; html: string };
}

const base = {
  sessionId: '11111111-1111-4111-8111-111111111111',
  studentId: '22222222-2222-4222-8222-222222222222',
  date: '2026-09-11',
  time: '19:00',
  duration: 45,
  meetingLink: 'https://meet.google.com/qa-auto-test',
  studentName: 'Austėja Mockutė',
  tutorName: 'Demo Mokytoja Ana',
  tutorEmail: 'ana@example.com',
};

// send-email imports thirteen locale dictionaries; under full-suite load the first
// import in a worker can exceed the 5 s default without anything being wrong.
vi.setConfig({ testTimeout: 30_000 });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = 'test-resend-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-test';
  sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });
});

describe('session_reminder_payer for school parents', () => {
  it('leads with the join button and never links the parent portal or registration', async () => {
    const { html } = await sendEmail({ ...base, schoolFlow: true });
    expect(html).toContain('Prisijungti prie pamokos');
    expect(html).toContain('/api/join-session?');
    expect(html).not.toContain('/parent/calendar');
    expect(html).not.toContain('Atidaryti pamoką kalendoriuje');
    expect(html).not.toMatch(/paskyr/i);
    expect(html).not.toMatch(/registr/i);
    expect(html).toContain('Austėja Mockutė');
  });

  it('keeps the portal button for non-school payers', async () => {
    const { html } = await sendEmail(base);
    expect(html).toContain('/parent/calendar');
    expect(html).not.toContain('Prisijungti prie pamokos');
  });
});
