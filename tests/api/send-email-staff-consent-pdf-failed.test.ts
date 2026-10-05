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

const ALERT_EMAIL = 'alaniukasa@gmail.com';

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

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = 'test-resend-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-test';
  sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });
});

describe('school staff consent pdf failure alert', () => {
  it('emails alaniukasa@gmail.com with employee and school context', async () => {
    const { default: handler } = await import('../../api/send-email');
    const res = mockRes();
    await handler({
      method: 'POST',
      body: {
        type: 'school_staff_consent_pdf_failed',
        to: ALERT_EMAIL,
        data: {
          employeeName: 'Margarita Skvarčienė',
          schoolName: 'VšĮ Laisvi vaikai',
          contractNumber: 'DAR-2026-ABCD',
          consentId: '33333333-3333-4333-8333-333333333333',
          source: 'employee_submit',
          adminUrl: 'https://tutlio.lt/school/staff-documents',
        },
        locale: 'lt',
      },
      headers: { 'content-type': 'application/json', 'x-internal-key': 'service-key-test' },
      query: {},
    } as any, res as any);

    expect(res.getResult().statusCode).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const payload = sendMock.mock.calls[0][0] as { to: string | string[]; subject: string; html: string };
    const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];
    expect(recipients).toEqual([ALERT_EMAIL]);
    expect(payload.subject).toContain('Margarita Skvarčienė');
    expect(payload.html).toContain('VšĮ Laisvi vaikai');
    expect(payload.html).toContain('Darbuotojas matė sėkmės pranešimą');
  });
});
