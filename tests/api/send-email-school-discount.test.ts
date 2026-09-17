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
vi.mock('../../api/_lib/sendPush', () => ({ sendPushForEmail: pushMock }));

function mockRes() {
  const out: { statusCode: number; body: any } = { statusCode: 0, body: null };
  return {
    status(code: number) { out.statusCode = code; return this; },
    json(body: any) { out.body = body; return this; },
    setHeader() { return this; },
    getResult: () => out,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = 'test-resend-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-test';
  sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });
});

describe('school_discount_offer email', () => {
  it('explains the discount and links to the explicit acceptance page', async () => {
    const { default: handler } = await import('../../api/send-email');
    const res = mockRes();
    await handler({
      method: 'POST',
      body: {
        type: 'school_discount_offer', to: 'parent@example.com', locale: 'lt',
        data: {
          schoolName: 'VšĮ „Laisvi vaikai“', parentName: 'Jonai', studentName: 'Jonas Jonaitis',
          activityLabel: 'Matematika 8 kl.', discountDescription: '25 % nuolaida',
          validFrom: '2026-09-01', validUntil: '2027-06-30', contractNumber: 'LV-1',
          acceptUrl: 'https://tutlio.lt/school-discount-accept?token=abc',
        },
      },
      headers: { 'content-type': 'application/json', 'x-internal-key': 'service-key-test' }, query: {},
    } as any, res as any);

    expect(res.getResult().statusCode).toBe(200);
    const sent = sendMock.mock.calls[0][0] as { subject: string; html: string };
    expect(sent.subject).toContain('Jums suteikta nuolaida');
    expect(sent.html).toContain('25 % nuolaida');
    expect(sent.html).toContain('school-discount-accept?token=abc');
    expect(sent.html).toContain('Sutinku');
    expect(sent.html).toContain('priedas prie metinės sutarties');
  }, 30_000);
});
