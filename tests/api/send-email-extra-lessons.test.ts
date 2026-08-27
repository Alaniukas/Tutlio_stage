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

const QA_PARENT_EMAIL = 'alaniukasa@gmail.com';

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

async function sendEmail(type: string, data: Record<string, unknown>) {
  const { default: handler } = await import('../../api/send-email');
  const res = mockRes();
  await handler(
    {
      method: 'POST',
      body: { type, to: QA_PARENT_EMAIL, data, locale: 'lt' },
      headers: { 'content-type': 'application/json', 'x-internal-key': 'service-key-test' },
      query: {},
    } as any,
    res as any,
  );
  expect(res.getResult().statusCode).toBe(200);
  expect(sendMock).toHaveBeenCalledTimes(1);
  const payload = sendMock.mock.calls[0][0] as { to: string | string[]; subject: string; html: string };
  const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];
  expect(recipients).toContain(QA_PARENT_EMAIL);
  return payload;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = 'test-resend-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-test';
  sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });
});

describe('school extra-lessons emails', () => {
  it('offer goes to QA parent inbox and has accept CTA', async () => {
    const sent = await sendEmail('school_contract_extra_offer', {
      schoolName: 'Demo Mokykla',
      studentName: 'QA Legal Per 14 d.',
      parentName: 'QA Extra Tėvas',
      contractNumber: 'PP-LEGAL-WITHIN14',
      acceptUrl: 'http://localhost:3000/school-extra-lessons-accept?token=abc',
      serviceName: 'QA Matematika',
      unitPrice: '18.00',
      monthlyPrice: '144.00',
      schedule: 'Antradieniais 16:00–16:45',
    });
    expect(sent.subject).toContain('PP-LEGAL-WITHIN14');
    expect(sent.html).toContain('Peržiūrėti ir patvirtinti sutartį');
    expect(sent.html).toContain('school-extra-lessons-accept');
    expect(sent.html).not.toContain('prievole sumokėti');
  });

  it('accepted mail includes SHA freeze', async () => {
    const sent = await sendEmail('school_contract_extra_accepted', {
      schoolName: 'Demo Mokykla',
      studentName: 'QA Legal Per 14 d.',
      parentName: 'QA Extra Tėvas',
      contractNumber: 'PP-1',
      acceptedAt: '2026-08-27 12:00',
      sha256: 'abc123sha',
    });
    expect(sent.html).toContain('abc123sha');
    expect(sent.subject).toContain('sudaryta');
  });

  it('withdrawal mail does not mention notifying the teacher', async () => {
    const sent = await sendEmail('school_contract_extra_withdrawn', {
      schoolName: 'Demo Mokykla',
      studentName: 'QA Legal Atsisakymas',
      parentName: 'QA Extra Tėvas',
      contractNumber: 'PP-LEGAL-WITHDRAW',
      at: '2026-08-27',
    });
    expect(sent.subject).toContain('atsisakymas');
    expect(sent.html).toContain('Mokytojo atskirai informuoti nereikia');
  });

  it('termination mail is distinct from withdrawal', async () => {
    const sent = await sendEmail('school_contract_extra_terminated', {
      schoolName: 'Demo Mokykla',
      studentName: 'QA Legal Nutraukimas',
      parentName: 'QA Extra Tėvas',
      contractNumber: 'PP-LEGAL-TERMINATE',
      at: '2026-08-27',
    });
    expect(sent.subject).toContain('nutraukimas');
    expect(sent.html).toContain('nutraukti');
    expect(sent.html).toContain('Mokytojo atskirai informuoti nereikia');
  });
});
