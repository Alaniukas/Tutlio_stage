import { beforeEach, describe, expect, it, vi } from 'vitest';

const MANO_ID = '2c4e4c2a-4e12-44ca-b327-d605bbb0d50b';
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  create: vi.fn(),
  retrieve: vi.fn(),
  expire: vi.fn(),
  update: vi.fn(),
  orgLookupIds: [] as string[],
  features: {} as Record<string, unknown>,
  existingCheckoutId: null as string | null,
  paid: false,
  invoiceNumbers: ['MK-1653'],
  invoiceError: false,
  orgId: '',
  entityType: 'company',
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: mocks.from }) }));
vi.mock('stripe', () => ({
  default: class Stripe {
    checkout = { sessions: { create: mocks.create, retrieve: mocks.retrieve, expire: mocks.expire } };
  },
}));

import handler from '../../api/pay-invoice';

function response() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    redirectUrl: null as string | null,
    status(code: number) { res.statusCode = code; return res; },
    json(body: unknown) { res.body = body; return res; },
    send(body: unknown) { res.body = body; return res; },
    redirect(code: number, url: string) { res.statusCode = code; res.redirectUrl = url; return res; },
  };
  return res;
}

describe('Mano Korepetitorius monthly invoice payment fee split', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.features = {
      org_payer_fee_split: true,
      payer_fee_split: { platform_share: 100, stripe_percent_share: 50, stripe_fixed_share: 0 },
    };
    mocks.existingCheckoutId = null;
    mocks.paid = false;
    mocks.invoiceNumbers = ['MK-1653'];
    mocks.invoiceError = false;
    mocks.orgId = MANO_ID;
    mocks.entityType = 'company';
    mocks.orgLookupIds.length = 0;
    mocks.create.mockResolvedValue({ id: 'cs_test_mano_invoice', url: 'https://checkout.stripe.test/mano' });
    mocks.from.mockImplementation((table: string) => {
      const result = () => ({
        data: table === 'billing_batches' ? {
          id: 'batch-1', tutor_id: 'tutor-1', period_start_date: '2026-09-01', period_end_date: '2026-09-30',
          total_amount: 40, paid: mocks.paid, payment_status: mocks.paid ? 'paid' : 'pending',
          payer_email: 'parent@example.test', payer_name: 'Parent', stripe_checkout_session_id: mocks.existingCheckoutId,
        } : table === 'profiles' ? {
          id: 'tutor-1', full_name: 'Tutor', organization_id: mocks.orgId, enable_manual_student_payments: false,
        } : table === 'organizations' ? {
          stripe_account_id: 'acct_mano_test', stripe_onboarding_complete: true,
          name: 'MB Mano korepetitorius', entity_type: mocks.entityType,
          slug: mocks.orgId === MANO_ID ? 'mb-mano-korepetitorius' : 'other-org', features: mocks.features,
        } : table === 'invoices' ? mocks.invoiceNumbers.map(invoice_number => ({ invoice_number }))
          : [{ session_id: 'lesson-1', session_price: 20 }, { session_id: 'lesson-2', session_price: 20 }],
        error: table === 'invoices' && mocks.invoiceError ? { message: 'unavailable' } : null,
      });
      const query = {
        select: () => query,
        neq: () => query,
        eq: (_column: string, value: string) => {
          if (table === 'organizations') mocks.orgLookupIds.push(value);
          return query;
        },
        single: async () => result(),
        update: (payload: unknown) => { mocks.update(table, payload); return query; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
      };
      return query;
    });
  });

  const request = { method: 'GET', headers: { host: 'localhost:3000' }, query: { batch: 'batch-1' } };

  it('charges the configured payer shares on the organization connected account', async () => {
    const res = response();
    await handler(request as any, res as any);

    expect(res.statusCode).toBe(303);
    expect(res.redirectUrl).toBe('https://checkout.stripe.test/mano');
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      customer_email: 'parent@example.test',
      line_items: [
        expect.objectContaining({ price_data: expect.objectContaining({ unit_amount: 4000,
          product_data: expect.objectContaining({ description: 'Mokymo paslaugos. Paslaugos teikėjas: MB Mano korepetitorius' }),
        }) }),
        expect.objectContaining({ price_data: expect.objectContaining({ unit_amount: 111 }) }),
      ],
      payment_intent_data: {
        application_fee_amount: 80,
        description: 'MK-1653 · Parent',
        metadata: { tutlio_billing_batch_id: 'batch-1', tutor_id: 'tutor-1', invoice_number: 'MK-1653', payer_name: 'Parent' },
      },
      metadata: expect.objectContaining({ tutlio_billing_batch_id: 'batch-1', tutor_id: 'tutor-1', tutlio_base_amount: '40.00', tutlio_currency: 'eur', invoice_number: 'MK-1653', payer_name: 'Parent' }),
      success_url: expect.stringContaining('stripe_account=acct_mano_test'),
    }), { stripeAccount: 'acct_mano_test' });
    expect(mocks.orgLookupIds).toEqual([MANO_ID]);
    expect(mocks.update).toHaveBeenCalledWith('billing_batches', { stripe_checkout_session_id: 'cs_test_mano_invoice' });
  });

  it('keeps the platform application fee when the organization covers all payer fees', async () => {
    mocks.features.payer_fee_split = { platform_share: 0, stripe_percent_share: 0, stripe_fixed_share: 0 };
    const res = response();
    await handler(request as any, res as any);

    const payload = mocks.create.mock.calls[0][0];
    expect(payload.line_items.map((item: any) => item.price_data.unit_amount)).toEqual([4000, 0]);
    expect(payload.payment_intent_data.application_fee_amount).toBe(80);
  });

  it('recreates an expired checkout using the current organization fee shares', async () => {
    mocks.existingCheckoutId = 'cs_test_expired';
    mocks.retrieve.mockResolvedValue({ status: 'expired', url: null });
    const res = response();
    await handler(request as any, res as any);

    expect(mocks.retrieve).toHaveBeenCalledWith('cs_test_expired', { stripeAccount: 'acct_mano_test' });
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create.mock.calls[0][0].line_items[1].price_data.unit_amount).toBe(111);
    expect(res.statusCode).toBe(303);
  });

  it('does not create another payment for an already paid invoice', async () => {
    mocks.paid = true;
    const res = response();
    await handler(request as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Sąskaita jau apmokėta');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('expires a legacy open checkout instead of reusing its empty Charge description', async () => {
    mocks.existingCheckoutId = 'cs_legacy';
    mocks.retrieve.mockResolvedValue({ status: 'open', url: 'https://checkout.stripe.test/legacy', metadata: { tutlio_billing_batch_id: 'batch-1' } });
    mocks.expire.mockResolvedValue({ status: 'expired' });
    const res = response();
    await handler(request as any, res as any);
    expect(mocks.expire).toHaveBeenCalledWith('cs_legacy', { stripeAccount: 'acct_mano_test' });
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(res.redirectUrl).toBe('https://checkout.stripe.test/mano');
  });

  it('reuses a checkout created with the current invoice number and payer', async () => {
    mocks.existingCheckoutId = 'cs_current';
    mocks.retrieve.mockResolvedValue({ status: 'open', url: 'https://checkout.stripe.test/current', metadata: { invoice_number: 'MK-1653', payer_name: 'Parent' } });
    const res = response();
    await handler(request as any, res as any);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.expire).not.toHaveBeenCalled();
    expect(res.redirectUrl).toBe('https://checkout.stripe.test/current');
  });

  it('includes every child invoice number in a shared family payment', async () => {
    mocks.invoiceNumbers = ['MK-1654', 'MK-1653', 'MK-1653'];
    await handler(request as any, response() as any);
    const payload = mocks.create.mock.calls[0][0];
    expect(payload.payment_intent_data.description).toBe('MK-1653, MK-1654 · Parent');
    expect(payload.payment_intent_data.metadata.invoice_number).toBe('MK-1653, MK-1654');
    expect(payload.metadata.invoice_number).toBe('MK-1653, MK-1654');
  });

  it.each(['company', 'school'])('includes reporting fields for another %s organization', async (entityType) => {
    mocks.orgId = 'other-org';
    mocks.entityType = entityType;
    mocks.invoiceNumbers = ['ORG-42'];
    await handler(request as any, response() as any);
    const payload = mocks.create.mock.calls[0][0];
    expect(payload.payment_intent_data.description).toBe('ORG-42 · Parent');
    expect(payload.payment_intent_data.metadata).toMatchObject({ invoice_number: 'ORG-42', payer_name: 'Parent', tutor_id: 'tutor-1' });
    expect(payload.metadata).toMatchObject({ invoice_number: 'ORG-42', payer_name: 'Parent' });
  });

  it.each([false, true])('does not create a nameless invoice payment when invoice lookup fails (%s)', async (queryFails) => {
    mocks.invoiceNumbers = [];
    mocks.invoiceError = queryFails;
    const res = response();
    await handler(request as any, res as any);
    expect(res.statusCode).toBe(queryFails ? 500 : 409);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
