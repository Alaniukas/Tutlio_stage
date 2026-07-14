// School contract email content: the final (signable) email must explain how to
// sign and where to return the contract, the initial "fill missing data" email
// must not, and the "questions" contact line must prefer the configurable
// contactEmail (e.g. irminta@) over the school's main email (info@).
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

async function sendEmail(type: string, data: Record<string, unknown>) {
  const { default: handler } = await import('../../api/send-email');
  const res = mockRes();
  await handler(mockReq({ type, to: 'parent@example.com', data, locale: 'lt' }) as any, res as any);
  expect(res.getResult().statusCode).toBe(200);
  expect(sendMock).toHaveBeenCalledTimes(1);
  return sendMock.mock.calls[0][0] as { subject: string; html: string };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_API_KEY = 'test-resend-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-test';
  sendMock.mockResolvedValue({ data: { id: 'email-1' }, error: null });
});

describe('school_contract signing instructions', () => {
  it('shows how-to-sign + return address on the final email (pdfUrl, no missing fields)', async () => {
    const { html } = await sendEmail('school_contract', {
      schoolName: 'VšĮ „Laisvi vaikai"',
      schoolEmail: 'info@laisvivaikai.lt',
      studentName: 'Jonukas Pet',
      recipientName: 'Irminta Mal',
      contractNumber: 'SUT-20260619-1347',
      missingFields: [],
      pdfUrl: 'https://example.com/final.pdf',
    });
    expect(html).toContain('Kaip pasirašyti?');
    expect(html).toContain('Pasirašytą sutartį prašome atsiųsti mokyklai el. paštu info@laisvivaikai.lt');
    expect(html).toContain('Smart-ID');
    // Final email is ready to sign — it must not still nag about missing data.
    expect(html).not.toContain('Prašome papildyti trūkstamus duomenis');
  });

  it('omits signing instructions on the initial email while data is still missing', async () => {
    const { html } = await sendEmail('school_contract', {
      schoolName: 'VšĮ „Laisvi vaikai"',
      schoolEmail: 'info@laisvivaikai.lt',
      studentName: 'Jonukas Pet',
      recipientName: 'Irminta Mal',
      // Realistic: a draft PDF may be attached, but missing fields block signing.
      pdfUrl: 'https://example.com/draft.pdf',
      missingFields: ['Gyvenamoji vieta', 'Vaiko gimimo data'],
    });
    expect(html).not.toContain('Kaip pasirašyti?');
    expect(html).toContain('Prašome papildyti trūkstamus duomenis');
  });

  it('requires parent review even when no data is missing in the GoSign flow', async () => {
    const { html } = await sendEmail('school_contract', {
      schoolName: 'VšĮ „Laisvi vaikai"',
      studentName: 'Jonukas Pet',
      recipientName: 'Irminta Mal',
      pdfUrl: 'https://example.com/review.pdf',
      completionUrl: 'https://tutlio.lt/school-contract-complete?token=safe-token',
      requiresReview: true,
      esignFlow: true,
      missingFields: [],
    });
    expect(html).toContain('Peržiūrėti ir patvirtinti sutartį');
    expect(html).toContain('safe-token');
    expect(html).not.toContain('Pasirašytą sutartį prašome atsiųsti mokyklai');
  });
});

describe('school_contract GoSign notifications', () => {
  it('emails the admin after review with Tutlio and PDF links', async () => {
    const { html } = await sendEmail('school_contract_completion_admin', {
      studentName: 'Jonukas Pet',
      contractNumber: 'SUT-001',
      contractsUrl: 'https://tutlio.lt/school/contracts',
      pdfUrl: 'https://example.com/reviewed.pdf',
    });
    expect(html).toContain('Sutartis paruošta mokyklos parašui');
    expect(html).toContain('https://tutlio.lt/school/contracts');
    expect(html).toContain('https://example.com/reviewed.pdf');
  });

  it('emails the admin after the parent signs the final document', async () => {
    const { html } = await sendEmail('school_contract_parent_signed_admin', {
      parentName: 'Irminta Mal',
      studentName: 'Jonukas Pet',
      contractsUrl: 'https://tutlio.lt/school/contracts',
      pdfUrl: 'https://example.com/final.pdf',
    });
    expect(html).toContain('Sutartis pasirašyta abiejų šalių');
    expect(html).toContain('https://example.com/final.pdf');
  });

  it('includes the signed PDF in the parent signature invitation and completion email', async () => {
    const invite = await sendEmail('school_contract_sign_request', {
      parentName: 'Irminta Mal',
      studentName: 'Jonukas Pet',
      signUrl: 'https://tutlio.lt/pasirasymas/sutarties/per/go-sign/token-1',
      pdfUrl: 'https://example.com/school-signed.pdf',
    });
    expect(invite.html).toContain('/pasirasymas/sutarties/per/go-sign/token-1');
    expect(invite.html).toContain('https://example.com/school-signed.pdf');

    vi.clearAllMocks();
    sendMock.mockResolvedValue({ data: { id: 'email-2' }, error: null });
    const complete = await sendEmail('school_contract_fully_signed', {
      parentName: 'Irminta Mal',
      studentName: 'Jonukas Pet',
      pdfUrl: 'https://example.com/final.pdf',
    });
    expect(complete.html).toContain('https://example.com/final.pdf');
    expect(complete.html).toContain('Atskiru laišku gausite apmokėjimo informaciją');
  });
});

describe('school_contract questions contact', () => {
  it('uses the configurable contactEmail for the questions line when provided', async () => {
    const { html } = await sendEmail('school_contract', {
      schoolName: 'VšĮ „Laisvi vaikai"',
      schoolEmail: 'info@laisvivaikai.lt',
      contactEmail: 'irminta@laisvivaikai.lt',
      studentName: 'Jonukas Pet',
      recipientName: 'Irminta Mal',
    });
    expect(html).toContain('susisiekite su mokykla: irminta@laisvivaikai.lt');
  });

  it('falls back to the school email for the questions line when contactEmail is absent', async () => {
    const { html } = await sendEmail('school_contract', {
      schoolName: 'VšĮ „Laisvi vaikai"',
      schoolEmail: 'info@laisvivaikai.lt',
      studentName: 'Jonukas Pet',
      recipientName: 'Irminta Mal',
    });
    expect(html).toContain('susisiekite su mokykla: info@laisvivaikai.lt');
  });
});
