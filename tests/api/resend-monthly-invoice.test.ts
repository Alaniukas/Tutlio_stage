import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const MANO_ID = '2c4e4c2a-4e12-44ca-b327-d605bbb0d50b';
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getUser: vi.fn(),
  retrieve: vi.fn(),
  download: vi.fn(),
  fetch: vi.fn(),
  existingCheckoutId: null as string | null,
  manualPayments: false,
  invoices: [] as Array<{ id: string; invoice_number: string; pdf_storage_path: string | null; pdf_meta?: { layout: string } }>,
  lineItems: [] as Array<{ session_ids: string[] }>,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: mocks.from,
    auth: { getUser: mocks.getUser },
    storage: { from: () => ({ download: mocks.download }) },
  }),
}));
vi.mock('stripe', () => ({ default: class Stripe { checkout = { sessions: { retrieve: mocks.retrieve } }; } }));

import handler from '../../api/resend-monthly-invoice';

function response() {
  const res = {
    statusCode: 200,
    body: null as any,
    setHeader: vi.fn(),
    status(code: number) { res.statusCode = code; return res; },
    send(body: string) { res.body = JSON.parse(body); return res; },
  };
  return res;
}

describe('Mano Korepetitorius monthly invoice reminders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role');
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_placeholder');
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.existingCheckoutId = null;
    mocks.manualPayments = false;
    mocks.invoices = [
      { id: 'invoice-1', invoice_number: 'MANO-1', pdf_storage_path: 'child-1.pdf', pdf_meta: { layout: 'pvm_education' } },
      { id: 'invoice-2', invoice_number: 'MANO-2', pdf_storage_path: 'child-2.pdf', pdf_meta: { layout: 'pvm_education' } },
    ];
    mocks.lineItems = [{ session_ids: ['lesson-1'] }, { session_ids: ['lesson-2'] }];
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'tutor-1' } }, error: null });
    mocks.download.mockResolvedValue({ data: { arrayBuffer: async () => Uint8Array.from([37, 80, 68, 70]).buffer }, error: null });
    mocks.fetch.mockResolvedValue({ ok: true });
    mocks.from.mockImplementation((table: string) => {
      const result = () => ({
        data: table === 'billing_batches' ? {
          id: 'batch-1', tutor_id: 'tutor-1', total_amount: 40, paid: false, payment_status: 'pending',
          period_start_date: '2026-09-01', period_end_date: '2026-09-30',
          payer_email: 'parent@example.test', payer_name: 'Parent', stripe_checkout_session_id: mocks.existingCheckoutId,
          profiles: { id: 'tutor-1', full_name: 'Tutor', organization_id: MANO_ID, enable_manual_student_payments: mocks.manualPayments },
        } : table === 'organizations' ? {
          name: 'MB Mano korepetitorius', stripe_account_id: 'acct_mano_test', entity_type: 'company', slug: 'mb-mano-korepetitorius',
          features: {
            org_payer_fee_split: true,
            pvm_education_invoice: true,
            payer_fee_split: { platform_share: 100, stripe_percent_share: 50, stripe_fixed_share: 0 },
          },
        } : table === 'invoices' ? mocks.invoices : table === 'invoice_line_items' ? mocks.lineItems : [
          { session_id: 'lesson-1', session_price: 20, sessions: { id: 'lesson-1', student_id: 'child-1', start_time: '2026-09-15T12:00:00Z', price: 99,
            subjects: { name: 'Math' }, students: { full_name: 'Child One' } } },
          { session_id: 'lesson-2', session_price: 20, sessions: { id: 'lesson-2', student_id: 'child-2', start_time: '2026-09-16T12:00:00Z', price: 99,
            subjects: { name: 'English' }, students: { full_name: 'Child Two' } } },
        ],
        error: null,
      });
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        neq: () => query,
        order: () => query,
        single: async () => result(),
        maybeSingle: async () => result(),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return query;
    });
  });

  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  const request = { method: 'POST', headers: { host: 'localhost:3000', authorization: 'Bearer mock' }, body: { billingBatchId: 'batch-1' } };
  const sentEmail = () => JSON.parse(mocks.fetch.mock.calls[0][1].body);

  it('quotes the current payer fee shares and billed lesson snapshots', async () => {
    const res = response();
    await handler(request as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(sentEmail().data).toMatchObject({
      lessonsTotal: '40.00', platformFees: '1.10', totalAmount: '41.10', tutorName: 'MB Mano korepetitorius',
      organizationId: MANO_ID, paymentLink: 'http://localhost:3000/api/pay-invoice?batch=batch-1',
      sessions: [{ price: '20.00' }, { price: '20.00' }],
    });
  });

  it('quotes the exact total of the open connected-account checkout', async () => {
    mocks.existingCheckoutId = 'cs_test_open';
    mocks.retrieve.mockResolvedValue({ status: 'open', amount_total: 4888 });
    const res = response();
    await handler(request as any, res as any);

    expect(mocks.retrieve).toHaveBeenCalledWith('cs_test_open', { stripeAccount: 'acct_mano_test' });
    expect(sentEmail().data).toMatchObject({ lessonsTotal: '40.00', platformFees: '8.88', totalAmount: '48.88' });
    expect(res.statusCode).toBe(200);
  });

  it('uses refreshed-checkout pricing when the old checkout cannot be retrieved', async () => {
    mocks.existingCheckoutId = 'cs_test_stale';
    mocks.retrieve.mockRejectedValue(new Error('Checkout no longer exists'));
    const res = response();
    await handler(request as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(sentEmail().data.totalAmount).toBe('41.10');
  });

  it('attaches every child invoice belonging to the family billing batch', async () => {
    const res = response();
    await handler(request as any, res as any);

    expect(mocks.download.mock.calls.map(([path]) => path)).toEqual(['child-1.pdf', 'child-2.pdf']);
    expect(sentEmail().attachments).toEqual([
      { filename: 'MANO-1.pdf', content: 'JVBERg==' },
      { filename: 'MANO-2.pdf', content: 'JVBERg==' },
    ]);
  });

  it('prevents sending an incomplete family reminder if one PDF cannot be loaded', async () => {
    mocks.download.mockResolvedValueOnce({ data: { arrayBuffer: async () => Uint8Array.from([37, 80, 68, 70]).buffer }, error: null });
    mocks.download.mockResolvedValueOnce({ data: null, error: { message: 'download failed' } });
    const res = response();
    await handler(request as any, res as any);

    expect(res.statusCode).toBe(502);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('prevents resending a partially issued family batch even when the first child PDF exists', async () => {
    mocks.invoices = mocks.invoices.slice(0, 1);
    mocks.lineItems = mocks.lineItems.slice(0, 1);
    const res = response();
    await handler(request as any, res as any);

    expect(res.statusCode).toBe(409);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it('requires all billed lessons to appear on the child invoices', async () => {
    mocks.lineItems = [{ session_ids: ['lesson-1'] }];
    const res = response();
    await handler(request as any, res as any);

    expect(res.statusCode).toBe(409);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each([false, true])('keeps a legacy no-S.F. reminder available with manual payments=%s', async (manual) => {
    mocks.manualPayments = manual;
    mocks.invoices = [{ id: 'summary', invoice_number: 'BB-BATCH1', pdf_storage_path: null }];
    const res = response();
    await handler(request as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(sentEmail().attachments).toBeUndefined();
    expect(sentEmail().data.totalAmount).toBe(manual ? '40.00' : '41.10');
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
