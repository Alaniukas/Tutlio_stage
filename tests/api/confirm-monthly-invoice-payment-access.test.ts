import { beforeEach, describe, expect, it, vi } from 'vitest';

function mockRes() {
  const result: { statusCode: number; body: any } = { statusCode: 0, body: null };
  return {
    status(code: number) {
      result.statusCode = code;
      return this;
    },
    json(body: any) {
      result.body = body;
      return this;
    },
    getResult: () => result,
  };
}

const verifyRequestAuth = vi.fn();
vi.mock('../../api/_lib/auth', () => ({ verifyRequestAuth }));

const retrieveCheckout = vi.fn();
vi.mock('stripe', () => {
  class StripeMock {
    checkout = { sessions: { retrieve: retrieveCheckout } };
  }
  return { default: StripeMock };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn() })),
}));

describe('POST /api/confirm-monthly-invoice-payment access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    verifyRequestAuth.mockResolvedValue({ userId: 'user-1', isInternal: false });
  });

  it('does not trust a billing batch id without Stripe verification', async () => {
    const handler = (await import('../../api/confirm-monthly-invoice-payment')).default;
    const res = mockRes();

    await handler({
      method: 'POST',
      headers: {},
      body: { billingBatchId: 'batch-1' },
    } as any, res as any);

    expect(res.getResult()).toMatchObject({
      statusCode: 400,
      body: { error: 'Missing checkoutSessionId' },
    });
    expect(retrieveCheckout).not.toHaveBeenCalled();
  });

  it('rejects a paid checkout session belonging to another billing batch', async () => {
    retrieveCheckout.mockResolvedValue({
      id: 'cs_paid',
      payment_status: 'paid',
      metadata: { tutlio_billing_batch_id: 'batch-from-stripe' },
    });
    const handler = (await import('../../api/confirm-monthly-invoice-payment')).default;
    const res = mockRes();

    await handler({
      method: 'POST',
      headers: {},
      body: { checkoutSessionId: 'cs_paid', billingBatchId: 'attacker-selected-batch' },
    } as any, res as any);

    expect(res.getResult()).toMatchObject({
      statusCode: 400,
      body: { error: 'Checkout session does not match billing batch' },
    });
  });

  it('fails closed when Stripe cannot validate the checkout session', async () => {
    retrieveCheckout.mockRejectedValue(new Error('not found'));
    const handler = (await import('../../api/confirm-monthly-invoice-payment')).default;
    const res = mockRes();

    await handler({
      method: 'POST',
      headers: {},
      body: { checkoutSessionId: 'cs_invalid' },
    } as any, res as any);

    expect(res.getResult()).toMatchObject({
      statusCode: 400,
      body: { error: 'Checkout session could not be validated' },
    });
  });
});
