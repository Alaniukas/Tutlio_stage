import { beforeEach, describe, expect, it, vi } from 'vitest';

const MANO_ID = '2c4e4c2a-4e12-44ca-b327-d605bbb0d50b';
const mocks = vi.hoisted(() => ({
  from: vi.fn(), checkout: vi.fn(), expire: vi.fn(), fetch: vi.fn(), download: vi.fn(),
  sessions: [] as any[], invoiceIds: ['invoice-1', 'invoice-2'],
  batches: [] as any[], writes: [] as Array<{ table: string; operation: string; value: any }>,
  invoiceGenerationFails: false, missingPdf: null as string | null,
  junctionFails: false, sessionLinkFails: false,
  checkoutSaveFails: false,
  manualPayments: false,
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  from: mocks.from, storage: { from: () => ({ download: mocks.download }) },
}) }));
vi.mock('stripe', () => ({ default: class Stripe {
  checkout = { sessions: { create: mocks.checkout, expire: mocks.expire } };
} }));
vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: async () => ({ isInternal: true, userId: null }) }));

import handler from '../../api/create-monthly-invoice';

function query(table: string) {
  let operation = 'read', value: any, columns = '';
  const filters: Record<string, any> = {};
  const result = () => {
    if (operation !== 'read') {
      mocks.writes.push({ table, operation, value });
      if (table === 'billing_batches' && operation === 'insert') {
        const batch = { id: `batch-${mocks.batches.length + 1}`, ...value };
        mocks.batches.push(batch);
        return { data: batch, error: null };
      }
      if (table === 'billing_batch_sessions' && operation === 'insert' && mocks.junctionFails) {
        return { data: null, error: { message: 'duplicate session' } };
      }
      if (table === 'sessions' && operation === 'update' && value.payment_batch_id && mocks.sessionLinkFails) {
        return { data: null, error: { message: 'update failed' } };
      }
      if (table === 'billing_batches' && operation === 'update' && value.stripe_checkout_session_id && mocks.checkoutSaveFails) {
        return { data: null, error: { message: 'checkout save failed' } };
      }
      return { data: null, error: null };
    }
    if (table === 'profiles') {
      if (columns === 'id' && filters.id === 'tutor-2') {
        return { data: { id: 'tutor-2' }, error: null };
      }
      if (columns === 'id') {
        return { data: [{ id: 'tutor-1' }, { id: 'tutor-2' }], error: null };
      }
      return { data: { id: 'tutor-1', full_name: 'Mokytojas', organization_id: MANO_ID,
        enable_manual_student_payments: mocks.manualPayments }, error: null };
    }
    if (table === 'organizations') return { data: {
      name: 'Mano korepetitorius', entity_type: 'company', stripe_account_id: 'acct_test',
      stripe_onboarding_complete: true, enable_monthly_billing: true, enable_per_lesson: false,
      features: { pvm_education_invoice: true, org_payer_fee_split: true },
    }, error: null };
    if (table === 'sessions') return { data: columns.includes('students!inner(payment_model') ? [] : mocks.sessions, error: null };
    if (table === 'invoices') {
      if (filters.id) return { data: { invoice_number: `SF-${filters.id}`, pdf_storage_path: `${filters.id}.pdf` }, error: null };
      return { data: mocks.invoiceGenerationFails ? [] : mocks.invoiceIds.map(id => ({ id })), error: null };
    }
    return { data: [], error: null };
  };
  const q: any = {
    select(c = '') { columns = c; return q; },
    eq(c: string, v: any) { filters[c] = v; return q; },
    in() { return q; }, is() { return q; }, gte() { return q; }, lte() { return q; }, lt() { return q; }, limit() { return q; },
    insert(v: any) { operation = 'insert'; value = v; return q; },
    update(v: any) { operation = 'update'; value = v; return q; },
    delete() { operation = 'delete'; return q; },
    single: async () => result(), maybeSingle: async () => result(),
    then(resolve: any) { return Promise.resolve(result()).then(resolve); },
  };
  return q;
}

function response() {
  const res = { statusCode: 0, body: null as any,
    status(code: number) { res.statusCode = code; return res; },
    json(body: any) { res.body = body; return res; },
  };
  return res;
}

async function send(body: Record<string, unknown> = {}) {
  const res = response();
  await handler({ method: 'POST', headers: { host: 'tutlio.lt' }, body: {
    tutorId: 'tutor-1', periodStartDate: '2026-09-01', periodEndDate: '2026-09-30',
    paymentDeadlineDays: 14, sessionIds: mocks.sessions.map(s => s.id),
    ...body,
  } } as any, res as any);
  return res;
}

describe('monthly invoice creation and delivery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.batches.length = 0; mocks.writes.length = 0;
    mocks.invoiceGenerationFails = false; mocks.missingPdf = null;
    mocks.junctionFails = false; mocks.sessionLinkFails = false;
    mocks.checkoutSaveFails = false;
    mocks.manualPayments = false;
    mocks.invoiceIds = ['invoice-1', 'invoice-2'];
    mocks.sessions = ['child-1', 'child-2'].map((id, i) => ({
      id: `lesson-${i}`, student_id: id, tutor_id: 'tutor-1', status: 'completed',
      price: 30, start_time: '2026-09-15T10:00:00Z',
      students: { id, full_name: id, payer_name: 'Tėvas', payer_email: 'parent@example.test' }, subjects: { name: 'Matematika' },
    }));
    mocks.from.mockImplementation(query);
    mocks.checkout.mockResolvedValue({ id: 'cs_test', url: 'https://checkout.stripe.com/test' });
    mocks.expire.mockResolvedValue({ id: 'cs_test', status: 'expired' });
    mocks.download.mockImplementation(async (path: string) => ({
      data: path === mocks.missingPdf ? null : { arrayBuffer: async () => new Uint8Array([37, 80, 68, 70]).buffer }, error: null,
    }));
    mocks.fetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/generate-invoice')) return {
        ok: !mocks.invoiceGenerationFails, status: mocks.invoiceGenerationFails ? 500 : 200,
        json: async () => ({ invoiceIds: mocks.invoiceIds }), text: async () => 'generation failed',
      };
      return { ok: true, status: 200 };
    });
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('attaches every child S.F. to the shared payer email and records delivery after sending', async () => {
    const res = await send();
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ success: true, totalBatches: 1, failures: [] });
    const emailCall = mocks.fetch.mock.calls.find(([url]) => url.endsWith('/api/send-email'));
    const email = JSON.parse(emailCall![1].body);
    expect(email.to).toBe('parent@example.test');
    expect(email.attachments.map((a: any) => a.filename)).toEqual(['SF-invoice-1.pdf', 'SF-invoice-2.pdf']);
    expect(mocks.batches[0].sent_at).toBeNull();
    expect(mocks.writes).toContainEqual(expect.objectContaining({ table: 'billing_batches', operation: 'update', value: { sent_at: expect.any(String) } }));
    expect(mocks.writes.some(w => w.table === 'invoices' && w.operation === 'insert')).toBe(false);
  });

  it('keeps an issued invoice for resend but reports an email delivery failure', async () => {
    mocks.fetch.mockImplementation(async (url: string) => url.endsWith('/api/generate-invoice')
      ? { ok: true, json: async () => ({ invoiceIds: mocks.invoiceIds }) }
      : { ok: false, status: 503, text: async () => 'mail unavailable' });
    const res = await send();
    expect(res.statusCode).toBe(502);
    expect(res.body).toMatchObject({ success: false, totalBatches: 0, failures: [{ payerEmail: 'parent@example.test', batchId: 'batch-1', stage: 'email' }] });
    expect(mocks.writes.some(w => w.table === 'billing_batches' && w.operation === 'delete')).toBe(false);
    expect(mocks.writes.some(w => w.value?.sent_at)).toBe(false);
  });

  it('attaches every child invoice when an organization tutor uses manual payments', async () => {
    mocks.manualPayments = true;
    const res = await send();
    expect(res.statusCode).toBe(200);
    expect(mocks.checkout).not.toHaveBeenCalled();
    const emailCall = mocks.fetch.mock.calls.find(([url]) => url.endsWith('/api/send-email'));
    const email = JSON.parse(emailCall![1].body);
    expect(email.attachments).toHaveLength(2);
    expect(email.data.manualPaymentInstructions).toBe(true);
  });

  it('does not send a family email with only one of the requested child PDFs', async () => {
    mocks.missingPdf = 'invoice-2.pdf';
    const res = await send();
    expect(res.statusCode).toBe(502);
    expect(res.body.failures[0]).toMatchObject({ batchId: 'batch-1', stage: 'invoice' });
    expect(mocks.fetch.mock.calls.some(([url]) => url.endsWith('/api/send-email'))).toBe(false);
  });

  it('detects a missing child invoice even when generate-invoice returns HTTP success', async () => {
    mocks.invoiceIds = ['invoice-1'];
    const res = await send();
    expect(res.body.success).toBe(false);
    expect(res.body.failures[0].stage).toBe('invoice');
    expect(mocks.fetch.mock.calls.some(([url]) => url.endsWith('/api/send-email'))).toBe(false);
  });

  it('releases a failed generation with no issued invoice, without synthesizing a BB invoice', async () => {
    mocks.invoiceGenerationFails = true;
    const res = await send();
    expect(res.body.failures[0].stage).toBe('invoice');
    expect(mocks.expire).toHaveBeenCalledWith('cs_test', { stripeAccount: 'acct_test' });
    expect(mocks.writes).toContainEqual(expect.objectContaining({ table: 'sessions', operation: 'update', value: { payment_batch_id: null } }));
    expect(mocks.writes.some(w => w.table === 'billing_batches' && w.operation === 'delete')).toBe(true);
    expect(mocks.writes.some(w => w.table === 'invoices' && w.operation === 'insert')).toBe(false);
  });

  it('reports Stripe failure rather than an empty success', async () => {
    mocks.checkout.mockRejectedValueOnce(new Error('Stripe unavailable'));
    const res = await send();
    expect(res.statusCode).toBe(502);
    expect(res.body).toMatchObject({ success: false, totalBatches: 0, failures: [{ stage: 'checkout' }] });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('does not charge or email after session linking fails', async () => {
    mocks.sessionLinkFails = true;
    const res = await send();
    expect(res.body.failures[0].stage).toBe('sessions');
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('releases and expires checkout when its reference cannot be saved', async () => {
    mocks.checkoutSaveFails = true;
    const res = await send();
    expect(res.body.failures[0].stage).toBe('checkout');
    expect(mocks.expire).toHaveBeenCalled();
    expect(mocks.writes.some(w => w.table === 'billing_batches' && w.operation === 'delete')).toBe(true);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('reports an already-billed lesson conflict without creating a second checkout', async () => {
    mocks.junctionFails = true;
    const res = await send();
    expect(res.body.failures[0].stage).toBe('sessions');
    expect(mocks.checkout).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('issues one child S.F. across duplicate student rows, tutors and subjects', async () => {
    mocks.invoiceIds = ['invoice-1'];
    mocks.sessions = [
      {
        id: 'lesson-0', student_id: 'row-math', tutor_id: 'tutor-1', status: 'completed',
        price: 20, start_time: '2026-09-15T10:00:00Z',
        students: { id: 'row-math', full_name: 'Greta B.', payer_name: 'Tėvas', payer_email: 'parent@example.test', organization_id: MANO_ID },
        subjects: { name: 'Matematika' },
      },
      {
        id: 'lesson-1', student_id: 'row-english', tutor_id: 'tutor-2', status: 'completed',
        price: 25, start_time: '2026-09-16T10:00:00Z',
        students: { id: 'row-english', full_name: 'Greta B.', payer_name: 'Tėvas', payer_email: 'parent@example.test', organization_id: MANO_ID },
        subjects: { name: 'Anglų k.' },
      },
    ];
    const res = await send({ organizationId: MANO_ID, tutorIds: ['tutor-1', 'tutor-2'], tutorId: undefined });
    expect(res.statusCode).toBe(200);
    const genCall = mocks.fetch.mock.calls.find(([url]) => url.endsWith('/api/generate-invoice'));
    const payload = JSON.parse(genCall![1].body);
    expect(payload.sessionIds).toEqual(['lesson-0', 'lesson-1']);
    const email = JSON.parse(mocks.fetch.mock.calls.find(([url]) => url.endsWith('/api/send-email'))![1].body);
    expect(email.attachments).toHaveLength(1);
  });

  it('returns a partial result when a later payer checkout fails', async () => {
    mocks.invoiceIds = ['invoice-1'];
    mocks.sessions[1].students.payer_email = 'other@example.test';
    mocks.checkout.mockResolvedValueOnce({ id: 'cs_test', url: 'https://checkout.stripe.com/test' }).mockRejectedValueOnce(new Error('Stripe unavailable'));
    const res = await send();
    expect(res.statusCode).toBe(207);
    expect(res.body).toMatchObject({ success: false, totalBatches: 1, failures: [{ payerEmail: 'other@example.test', stage: 'checkout' }] });
  });
});
