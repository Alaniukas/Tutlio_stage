// Regression: email data is escaped twice — once at the request boundary by
// sanitizeEmailData() and again inside the template via esc(). A naive escaper
// double-encodes, so a school name like `VšĮ „Laisvi vaikai"` reached the
// recipient as `… vaikai&quot;` (literal entity text). escapeHtml() must be
// idempotent: special characters are encoded exactly once.
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

describe('school_contract escaping', () => {
  it('encodes a quote in the school name exactly once (no &amp;quot;)', async () => {
    const { html } = await sendEmail('school_contract', {
      schoolName: 'VšĮ „Laisvi vaikai"',
      studentName: 'Jonukas Pet',
      recipientName: 'Irminta Mal',
      contractNumber: 'SUT-20260619-1347',
    });
    // Correct single escape is present…
    expect(html).toContain('VšĮ „Laisvi vaikai&quot;');
    // …and the double-escaped form that produced the visible "&quot;" is gone.
    expect(html).not.toContain('&amp;quot;');
  });

  it('encodes an ampersand in the school name exactly once (no &amp;amp;)', async () => {
    const { html } = await sendEmail('school_contract', {
      schoolName: 'Tom & Jerry School',
      studentName: 'Jonukas Pet',
      recipientName: 'Irminta Mal',
    });
    expect(html).toContain('Tom &amp; Jerry School');
    expect(html).not.toContain('&amp;amp;');
  });

  it('still escapes angle brackets so injected markup cannot render', async () => {
    const { html } = await sendEmail('school_contract', {
      schoolName: '<script>alert(1)</script>',
      studentName: 'Jonukas Pet',
      recipientName: 'Irminta Mal',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
