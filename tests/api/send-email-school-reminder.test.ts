// School parents get lesson reminders on the contract email without a Tutlio
// account: the school variant must lead with the join link and must not push
// them into the parent portal (or towards registering).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionReminderDeliveryKey } from '../../api/_lib/sessionReminderDelivery';

const { sendMock, pushMock, contractAccess } = vi.hoisted(() => ({
  sendMock: vi.fn(),
  pushMock: vi.fn().mockResolvedValue(undefined),
  contractAccess: { allowed: true },
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

vi.mock('../../api/_lib/schoolContractAccess.js', () => ({
  checkSchoolSessionStudentAccess: async () => ({ isSchool: true, allowed: contractAccess.allowed }),
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
  contractAccess.allowed = true;
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
    expect(html).not.toContain('Grupės įrašai');
  });

  it('adds a group recordings button next to homework when the school has recordings', async () => {
    const { html } = await sendEmail({
      ...base,
      schoolFlow: true,
      homeworkUrl: 'https://tutlio.lt/school-homework?student=s1&t=abc',
      recordingsUrl: 'https://tutlio.lt/school-homework?student=s1&t=abc#recordings',
    });
    expect(html).toContain('Namų darbai ir užsiėmimo medžiaga');
    expect(html).toContain('Grupės įrašai');
    expect(html).toContain('#recordings');
    expect(html).not.toContain('drive.google.com');
  });

  it('keeps the portal button for non-school payers', async () => {
    const { html } = await sendEmail(base);
    expect(html).toContain('/parent/calendar');
    expect(html).not.toContain('Prisijungti prie pamokos');
  });

  it('suppresses the join email when the school contract is not active', async () => {
    contractAccess.allowed = false;
    const { default: handler } = await import('../../api/send-email');
    const res = mockRes();
    await handler(mockReq({
      type: 'session_reminder_payer',
      to: 'parent@example.com',
      data: { ...base, schoolFlow: true, schoolContractAccessRequired: true },
      locale: 'lt',
    }) as any, res as any);

    expect(res.getResult()).toMatchObject({
      statusCode: 200,
      body: { success: true, skipped: true, reason: 'school_contract_not_active' },
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('does not confirm a reminder when the provider omits its message id', async () => {
    sendMock.mockResolvedValue({ data: null, error: null });
    const scope = `payer:${base.sessionId}`;
    const { default: handler } = await import('../../api/send-email');
    const res = mockRes();
    await handler(mockReq({
      type: 'session_reminder_payer',
      to: 'parent@example.com',
      idempotencyKey: sessionReminderDeliveryKey('session_reminder_payer', 'parent@example.com', scope),
      data: {
        ...base,
        reminderDeliveryScope: scope,
      },
      locale: 'lt',
    }) as any, res as any);

    expect(res.getResult()).toMatchObject({
      statusCode: 503,
      body: { error: 'Reminder delivery was not confirmed' },
    });
  });
});
