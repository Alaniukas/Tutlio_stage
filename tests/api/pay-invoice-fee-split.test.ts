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
    mocks.orgLookupIds.length = 0;
    mocks.create.mockResolvedValue({ id: 'cs_test_mano_invoice', url: 'https://checkout.stripe.test/mano' });
    mocks.from.mockImplementation((table: string) => {
      const result = () => ({
        data: table === 'billing_batches' ? {
          id: 'batch-1', tutor_id: 'tutor-1', period_start_date: '2026-09-01', period_end_date: '2026-09-30',
          total_amount: 40, paid: mocks.paid, payment_status: mocks.paid ? 'paid' : 'pending',
          payer_email: 'parent@example.test', payer_name: 'Parent', stripe_checkout_session_id: mocks.existingCheckoutId,
        } : table === 'profiles' ? {
          id: 'tutor-1', full_name: 'Tutor', organization_id: MANO_ID, enable_manual_student_payments: false,
        } : table === 'organizations' ? {
          stripe_account_id: 'acct_mano_test', stripe_onboarding_complete: true,
          name: 'MB Mano korepetitorius', entity_type: 'company', slug: 'mb-mano-korepetitorius', features: mocks.features,
        } : [{ session_id: 'lesson-1', session_price: 20 }, { session_id: 'lesson-2', session_price: 20 }],
        error: null,
      });
      const query = {
        select: () => query,
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
        expect.objectContaining({ price_data: expect.objectContaining({ unit_amount: 110 }) }),
      ],
      payment_intent_data: expect.objectContaining({ application_fee_amount: 80 }),
      metadata: expect.objectContaining({ tutlio_billing_batch_id: 'batch-1', tutlio_base_amount: '40.00', tutlio_currency: 'eur' }),
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
    expect(mocks.create.mock.calls[0][0].line_items[1].price_data.unit_amount).toBe(110);
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
});
