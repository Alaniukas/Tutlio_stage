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
          contractAccepted: true,
          pdfUrl: 'https://storage.example/discount-proposal.pdf',
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
    expect(sent.html).toContain('priedą prie užsiėmimų sutarties');
    expect(sent.html).not.toContain('https://storage.example/discount-proposal.pdf');
    expect(sent.html).not.toContain('metinės sutarties');
    expect(sent.html).not.toContain('Peržiūrėti ir patvirtinti sutartį');
  }, 30_000);

  it('sends both documents in one email before the main contract is accepted', async () => {
    const { default: handler } = await import('../../api/send-email');
    const res = mockRes();
    await handler({
      method: 'POST',
      body: {
        type: 'school_discount_offer', to: 'parent@example.com', locale: 'lt',
        data: {
          schoolName: 'Ąžuolo mokykla', parentName: 'Rūta', studentName: 'Jonas Jonaitis',
          activityLabel: 'Matematika 8 kl.', discountDescription: '25 % nuolaida',
          validFrom: '2026-09-01', validUntil: '2027-06-30', contractNumber: 'AZ-1',
          agreementNumber: 'NPR-1', contractAccepted: false,
          contractAcceptUrl: 'https://tutlio.lt/school-extra-lessons-accept?token=contract-token',
          contractPdfUrl: 'https://storage.example/main-contract.pdf',
          pdfUrl: 'https://storage.example/discount-proposal.pdf',
          acceptUrl: 'https://tutlio.lt/school-discount-accept?token=discount-token',
        },
      },
      headers: { 'content-type': 'application/json', 'x-internal-key': 'service-key-test' }, query: {},
    } as any, res as any);

    expect(res.getResult().statusCode).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const sent = sendMock.mock.calls[0][0] as { subject: string; html: string };
    expect(sent.subject).toContain('Užsiėmimų sutartis ir nuolaidos priedas');
    expect(sent.html).toContain('Ąžuolo mokykla');
    expect(sent.html).not.toContain('Laisvi vaikai');
    expect(sent.html).toContain('school-extra-lessons-accept?token=contract-token');
    expect(sent.html).toContain('school-discount-accept?token=discount-token');
    expect(sent.html).not.toContain('https://storage.example/main-contract.pdf');
    expect(sent.html).not.toContain('https://storage.example/discount-proposal.pdf');
    expect(sent.html).not.toContain('Abu PDF dokumentai pridėti prie šio laiško.');
    expect(sent.html).toContain('Peržiūrėti ir patvirtinti sutartį');
    expect(sent.html).toContain('Peržiūrėti ir patvirtinti priedą');
    expect(sent.html).toContain('atskirai bet kuria eilės tvarka');
    expect(sent.html).toContain('kai patvirtinti abu dokumentai');
    expect(sent.html).toContain('priede nurodytu galiojimo laikotarpiu');
    expect(sent.html).not.toContain('metinės sutarties');
  });

  it('preserves both PDF attachments without exposing expiring storage URLs', async () => {
    const { default: handler } = await import('../../api/send-email');
    const res = mockRes();
    const contractPdf = Buffer.from('%PDF-1.7 contract');
    const discountPdf = Buffer.from('%PDF-1.7 discount');
    await handler({
      method: 'POST',
      body: {
        type: 'school_discount_offer', to: 'parent@example.com', locale: 'lt',
        data: {
          schoolName: 'Ąžuolo mokykla', parentName: 'Rūta', studentName: 'Jonas Jonaitis',
          contractNumber: 'AZ-1', agreementNumber: 'NPR-1', activityLabel: 'Matematika',
          discountDescription: '25 % nuolaida', validFrom: '2026-09-01', validUntil: '2027-06-30',
          contractAccepted: false, documentsAttached: true,
          contractAcceptUrl: 'https://tutlio.lt/school-extra-lessons-accept?token=contract-token',
          acceptUrl: 'https://tutlio.lt/school-discount-accept?token=discount-token',
          contractPdfUrl: 'https://storage.example/main.pdf?token=expires-soon',
          pdfUrl: 'https://storage.example/discount.pdf?token=expires-soon',
        },
        attachments: [
          { filename: 'Sutartis-AZ-1.pdf', content: contractPdf.toString('base64') },
          { filename: 'Nuolaidos-priedas-NPR-1.pdf', content: discountPdf.toString('base64') },
        ],
      },
      headers: { 'content-type': 'application/json', 'x-internal-key': 'service-key-test' }, query: {},
    } as any, res as any);

    expect(res.getResult().statusCode).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const sent = sendMock.mock.calls[0][0] as { html: string; attachments: Array<{ filename: string; content: Buffer }> };
    expect(sent.html).toContain('Abu PDF dokumentai pridėti prie šio laiško.');
    expect(sent.html).not.toContain('storage.example');
    expect(sent.html).not.toContain('expires-soon');
    expect(sent.html).toContain('school-extra-lessons-accept?token=contract-token');
    expect(sent.html).toContain('school-discount-accept?token=discount-token');
    expect(sent.attachments).toEqual([
      { filename: 'Sutartis-AZ-1.pdf', content: contractPdf },
      { filename: 'Nuolaidos-priedas-NPR-1.pdf', content: discountPdf },
    ]);
  });
});
