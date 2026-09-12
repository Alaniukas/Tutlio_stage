/**
 * End-to-end school contract + payment flow (API handlers, mocked externals).
 *
 * Flow: admin completion link → send-email (unified token) → parent GET/POST complete
 * → admin mark signed → Stripe checkout → confirm payment.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flowDb } from '../helpers/schoolContractFlowFixtures';

const stripeCheckoutCreate = vi.hoisted(() => vi.fn());
const stripeRetrieve = vi.hoisted(() => vi.fn());
const resendSend = vi.hoisted(() => vi.fn());
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('@supabase/supabase-js', async () => {
  const { createMockSupabaseClient } = await import('../helpers/mockSchoolContractSupabase');
  const { flowDb } = await import('../helpers/schoolContractFlowFixtures');
  return {
    createClient: vi.fn(() => createMockSupabaseClient(flowDb)),
  };
});

vi.mock('stripe', () => ({
  default: class StripeMock {
    checkout = { sessions: { create: stripeCheckoutCreate, retrieve: stripeRetrieve } };
    constructor(_k: string, _o?: unknown) {}
  },
}));

vi.mock('resend', () => ({
  Resend: class ResendMock {
    emails = { send: resendSend };
    constructor(_k: string) {}
  },
}));

vi.mock('../../api/_lib/auth', async () => {
  const { flowDb } = await import('../helpers/schoolContractFlowFixtures');
  return {
    verifyRequestAuth: vi.fn(async () => ({ userId: flowDb.adminUserId, isInternal: false })),
    isInternalRequest: vi.fn(() => false),
  };
});

vi.mock('../../api/_lib/renderSchoolContractDocxToPdf', () => ({
  renderDocxTemplateUrlToPdfBuffer: vi.fn(async () => Buffer.from('%PDF-mock')),
  renderDocxBufferToPdfBuffer: vi.fn(async () => Buffer.from('%PDF-mock')),
}));

function mockRes() {
  const out: { statusCode: number; headers: Record<string, string>; body: string } = {
    statusCode: 0,
    headers: {},
    body: '',
  };
  const res = {
    setHeader(k: string, v: string) {
      out.headers[k] = v;
    },
    status(code: number) {
      out.statusCode = code;
      return res;
    },
    json(body: unknown) {
      out.body = JSON.stringify(body);
      if (!out.statusCode) out.statusCode = 200;
      return res;
    },
    send(body: string) {
      out.body = body;
      return res;
    },
    redirect(code: number, url: string) {
      out.statusCode = code;
      out.headers.Location = url;
      return res;
    },
    end(body?: string) {
      if (body !== undefined) out.body = body;
      return res;
    },
    getResult: () => out,
  };
  Object.defineProperty(res, 'statusCode', {
    get: () => out.statusCode,
    set: (v: number) => {
      out.statusCode = v;
    },
    enumerable: true,
    configurable: true,
  });
  return res;
}

function mockReq(
  method: string,
  opts: { body?: unknown; query?: Record<string, string>; headers?: Record<string, string> } = {},
) {
  return {
    method,
    body: opts.body ?? {},
    query: opts.query ?? {},
    headers: {
      'content-type': 'application/json',
      host: 'www.tutlio.lt',
      'x-forwarded-proto': 'https',
      authorization: 'Bearer admin-jwt',
      ...opts.headers,
    },
  };
}

describe('School contract full flow (API integration)', () => {
  const env = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...env,
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'service_test',
      VITE_SUPABASE_URL: 'https://test.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'anon_test',
      STRIPE_SECRET_KEY: 'sk_test',
      RESEND_API_KEY: 're_test',
      APP_URL: 'https://www.tutlio.lt',
    };

    flowDb.student.payer_personal_code = null;
    flowDb.student.student_address = null;
    flowDb.student.student_city = null;
    flowDb.student.child_birth_date = null;
    flowDb.student.media_publicity_consent = null;
    flowDb.student.invite_code = null;
    flowDb.contract.signing_status = 'sent';
    flowDb.contract.signed_at = null;
    flowDb.contract.pdf_url = 'org-school-1/contracts/contract-1/Sutartis-SUT-001.pdf';
    flowDb.tokens = [];
    flowDb.installments[0].payment_status = 'pending';
    flowDb.installments[0].stripe_checkout_session_id = null;
    flowDb.installments[0].paid_at = null;

    stripeCheckoutCreate.mockResolvedValue({ id: 'cs_test_flow', url: 'https://checkout.stripe.test/cs' });
    stripeRetrieve.mockResolvedValue({
      payment_status: 'paid',
      payment_intent: 'pi_test',
      metadata: {
        tutlio_school_installment_id: flowDb.installments[0].id,
        tutlio_student_id: flowDb.student.id,
      },
    });
    resendSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetchMock);
  });

  it('runs admin → parent complete → mark signed → payment', async () => {
    let accessToken = '';
    let completionUrl = '';

    // 1) Admin: completion link token
    const linkHandler = (await import('../../api/school-contract-completion-link')).default;
    const linkRes = mockRes();
    await linkHandler(
      mockReq('POST', { body: { contractId: flowDb.contract.id }, headers: { authorization: 'Bearer admin-jwt' } }) as any,
      linkRes as any,
    );
    const linkOut = linkRes.getResult();
    expect(linkOut.statusCode).toBe(200);
    const linkJson = JSON.parse(linkOut.body || '{}');
    expect(linkJson.completionUrl).toContain('token=');
    completionUrl = linkJson.completionUrl;
    accessToken = new URL(completionUrl).searchParams.get('token') || '';
    expect(flowDb.findToken(accessToken)).toBeTruthy();

    // 2) send-email: unified token for PDF + completion
    const sendHandler = (await import('../../api/send-email')).default;
    const sendRes = mockRes();
    await sendHandler(
      mockReq('POST', {
        body: {
          type: 'school_contract',
          to: 'tevas@test.lt',
          data: {
            contractId: flowDb.contract.id,
            completionUrl,
            missingFields: ['Gyvenamoji vieta', 'Vaiko gimimo data', 'Tėvų asmens kodas'],
            schoolName: flowDb.org.name,
            schoolEmail: flowDb.org.email,
            studentName: flowDb.student.full_name,
            parentName: flowDb.student.payer_name,
            recipientName: flowDb.student.payer_name,
            annualFee: flowDb.contract.annual_fee,
            contractNumber: flowDb.contract.contract_number,
            organizationId: flowDb.org.id,
          },
        },
      }) as any,
      sendRes as any,
    );
    expect(sendRes.getResult().statusCode).toBe(200);
    expect(resendSend).toHaveBeenCalled();
    const emailCall = resendSend.mock.calls[0]?.[0] as { html?: string };
    // When required contract data is still missing, the parent gets the
    // completion action first; the regenerated PDF is available afterwards.
    expect(emailCall.html).not.toContain('/api/school-contract-pdf?token=');
    expect(emailCall.html).toContain('/school-contract-complete?token=');
    const formMatch = emailCall.html!.match(/school-contract-complete\?token=([^"'&]+)/);
    const formToken = formMatch ? decodeURIComponent(formMatch[1]) : null;
    expect(formToken).toBe(accessToken);

    // 3) Parent: GET form meta
    const completeHandler = (await import('../../api/school-contract-complete')).default;
    const metaRes = mockRes();
    await completeHandler(
      mockReq('GET', { query: { token: accessToken, format: 'json' } }) as any,
      metaRes as any,
    );
    expect(metaRes.getResult().statusCode).toBe(200);
    const meta = JSON.parse(metaRes.getResult().body);
    expect(meta.ok).toBe(true);
    expect(meta.missing.address).toBe(true);
    expect(meta.missing.birthDate).toBe(true);
    expect(meta.missing.parentCode).toBe(true);

    // 4) Parent: POST missing data → regenerates contract PDF path
    const postRes = mockRes();
    const resendCallsBeforePost = resendSend.mock.calls.length;
    await completeHandler(
      mockReq('POST', {
        body: {
          token: accessToken,
          contractId: flowDb.contract.id,
          parent_personal_code: '39001010000',
          student_address: 'Gatvė 1',
          student_city: 'Vilnius',
          child_birth_date: '2015-05-01',
          media_publicity_consent: 'agree',
        },
      }) as any,
      postRes as any,
    );
    expect(postRes.getResult().statusCode).toBe(200);
    expect(flowDb.student.payer_personal_code).toBe('39001010000');
    expect(flowDb.student.student_address).toBe('Gatvė 1');
    expect(flowDb.contract.signing_status).toBe('sent');
    expect(flowDb.contract.pdf_url).toContain('/contracts/');
    const used = flowDb.findToken(accessToken);
    expect(used?.used_at).toBeTruthy();
    expect(resendSend.mock.calls.length).toBeGreaterThan(resendCallsBeforePost);

    // 5) Parent: open PDF with same token (still valid for view after used_at — pdf endpoint does not check used_at)
    const pdfHandler = (await import('../../api/school-contract-pdf')).default;
    const pdfRes = mockRes();
    await pdfHandler(mockReq('GET', { query: { token: accessToken } }) as any, pdfRes as any);
    expect(pdfRes.getResult().statusCode).toBe(200);
    const pdfHeaders = pdfRes.getResult().headers;
    expect(pdfHeaders['Content-Type'] || pdfHeaders['content-type']).toContain('application/pdf');

    // 6) Org admin: mark signed
    const markHandler = (await import('../../api/school-contract-mark-signed')).default;
    const markRes = mockRes();
    await markHandler(
      mockReq('POST', { body: { contractId: flowDb.contract.id } }) as any,
      markRes as any,
    );
    const markJson = JSON.parse(markRes.getResult().body || '{}');
    expect(markJson.success).toBe(true);
    expect(flowDb.contract.signing_status).toBe('signed');
    expect(flowDb.student.invite_code).toBeTruthy();

    // 7) Checkout for installment
    const checkoutHandler = (await import('../../api/pay-school-installment')).default;
    const checkoutRes = mockRes();
    await checkoutHandler(
      mockReq('GET', { query: { installment: flowDb.installments[0].id } }) as any,
      checkoutRes as any,
    );
    expect(checkoutRes.getResult().statusCode).toBe(303);
    expect(checkoutRes.getResult().headers.Location).toContain('checkout.stripe');
    expect(stripeCheckoutCreate).toHaveBeenCalled();
    const [checkoutParams, checkoutOptions] = stripeCheckoutCreate.mock.calls[0];
    expect(checkoutOptions).toEqual({ stripeAccount: flowDb.org.stripe_account_id });
    expect(checkoutParams.customer_creation).toBe('always');
    expect(checkoutParams.payment_intent_data.transfer_data).toBeUndefined();
    expect(checkoutParams.payment_intent_data.application_fee_amount).toBe(300);
    expect(checkoutParams.line_items.reduce(
      (sum: number, item: any) => sum + item.price_data.unit_amount * item.quantity,
      0,
    )).toBe(30_300);
    expect(flowDb.installments[0].stripe_checkout_session_id).toBe('cs_test_flow');

    // 8) Parent pays — confirm installment
    const confirmHandler = (await import('../../api/confirm-school-installment-payment')).default;
    const confirmRes = mockRes();
    await confirmHandler(
      mockReq('POST', {
        body: { sessionId: 'cs_test_flow', installmentId: flowDb.installments[0].id },
      }) as any,
      confirmRes as any,
    );
    const confirmJson = JSON.parse(confirmRes.getResult().body || '{}');
    expect(confirmJson.success).toBe(true);
    expect(flowDb.installments[0].payment_status).toBe('paid');
    expect(flowDb.installments[0].paid_at).toBeTruthy();
  }, 15_000);

  it('rejects completion form when token is unknown', async () => {
    const completeHandler = (await import('../../api/school-contract-complete')).default;
    const res = mockRes();
    await completeHandler(
      mockReq('GET', { query: { token: 'bad-token-xyz', format: 'json' } }) as any,
      res as any,
    );
    expect(res.getResult().statusCode).toBe(404);
    expect(res.getResult().body).toContain('Nuoroda nerasta');
  });
});
