import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    getResult: () => out,
  };
}

function mockReq(method: string, body?: unknown, headers?: Record<string, string>) {
  return {
    method,
    body,
    headers: { 'content-type': 'application/json', ...(headers || {}) },
    query: {},
  };
}

const stripeSessionCreate = vi.fn();
const stripePriceRetrieve = vi.fn();
const stripePricesList = vi.fn();
const stripePromotionCodesList = vi.fn();
const stripeCouponsList = vi.fn();

vi.mock('stripe', () => {
  class StripeMock {
    checkout = { sessions: { create: stripeSessionCreate } };
    prices = { retrieve: stripePriceRetrieve, list: stripePricesList };
    promotionCodes = { list: stripePromotionCodesList };
    coupons = { list: stripeCouponsList };
    constructor(_key: string, _opts: any) {}
  }
  return { default: StripeMock };
});

const authGetUser = vi.fn();
const profileSingle = vi.fn();
const from = vi.fn(() => ({
  select: vi.fn(() => ({ eq: vi.fn(() => ({ single: profileSingle })) })),
}));

const createClient = vi.fn(() => ({ from, auth: { getUser: authGetUser } }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

async function loadHandler() {
  return (await import('../../api/create-subscription-checkout')).default;
}

describe('POST /api/create-subscription-checkout (default 7-day trial)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key';
    process.env.STRIPE_MONTHLY_PRICE_ID = 'price_monthly_test';
    process.env.STRIPE_YEARLY_PRICE_ID = 'price_yearly_test';
    process.env.STRIPE_SUBSCRIPTION_ONLY_PRICE_ID = 'price_subonly_test';

    stripeSessionCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/test-session' });
    stripePriceRetrieve.mockResolvedValue({
      id: 'price_monthly_test',
      type: 'recurring',
      recurring: { interval: 'month' },
    });
    authGetUser.mockResolvedValue({ data: { user: null }, error: null });
    profileSingle.mockResolvedValue({ data: null, error: null });
  });

  it('rejects invalid plans', async () => {
    const handler = await loadHandler();
    const res = mockRes();
    await handler(mockReq('POST', { plan: 'weekly' }) as any, res as any);
    expect((res as any).getResult().statusCode).toBe(400);
  });

  it('applies the 7-day trial by default for anonymous monthly checkouts', async () => {
    const handler = await loadHandler();
    const res = mockRes();
    await handler(mockReq('POST', { plan: 'monthly' }) as any, res as any);

    const result = (res as any).getResult();
    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ trialApplied: true, trialDays: 7 });

    const params = stripeSessionCreate.mock.calls[0][0];
    expect(params.mode).toBe('subscription');
    expect(params.subscription_data?.trial_period_days).toBe(7);
    expect(params.payment_method_collection).toBe('always');
    expect(params.metadata?.tutlio_trial).toBe('7d');
    expect(params.allow_promotion_codes).toBe(true);
  });

  it('applies the default trial to recurring yearly and subscription_only plans', async () => {
    stripePriceRetrieve.mockResolvedValue({
      id: 'price_yearly_test',
      type: 'recurring',
      recurring: { interval: 'year' },
    });
    const handler = await loadHandler();
    for (const plan of ['yearly', 'subscription_only'] as const) {
      const res = mockRes();
      await handler(mockReq('POST', { plan }) as any, res as any);
      expect((res as any).getResult().body).toMatchObject({ trialApplied: true, trialDays: 7 });
    }
    for (const call of stripeSessionCreate.mock.calls) {
      expect(call[0].subscription_data?.trial_period_days).toBe(7);
    }
  });

  it('skips the trial when startTrial is explicitly false', async () => {
    const handler = await loadHandler();
    const res = mockRes();
    await handler(mockReq('POST', { plan: 'monthly', startTrial: false }) as any, res as any);

    const result = (res as any).getResult();
    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ trialApplied: false, trialDays: 0 });

    const params = stripeSessionCreate.mock.calls[0][0];
    expect(params.subscription_data).toBeUndefined();
    expect(params.allow_promotion_codes).toBe(true);
  });

  it('silently skips the default trial when the account already used it', async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'a@b.lt' } }, error: null });
    profileSingle.mockResolvedValue({ data: { trial_used: true }, error: null });

    const handler = await loadHandler();
    const res = mockRes();
    await handler(mockReq('POST', { plan: 'monthly' }, { authorization: 'Bearer token' }) as any, res as any);

    const result = (res as any).getResult();
    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ trialApplied: false });
    expect(stripeSessionCreate.mock.calls[0][0].subscription_data).toBeUndefined();
  });

  it('returns 400 when the trial is explicitly requested but already used', async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'a@b.lt' } }, error: null });
    profileSingle.mockResolvedValue({ data: { trial_used: true }, error: null });

    const handler = await loadHandler();
    const res = mockRes();
    await handler(
      mockReq('POST', { plan: 'monthly', startTrial: true }, { authorization: 'Bearer token' }) as any,
      res as any,
    );

    expect((res as any).getResult().statusCode).toBe(400);
    expect(stripeSessionCreate).not.toHaveBeenCalled();
  });

  it('treats legacy trial codes as a trial request, not a Stripe discount code', async () => {
    const handler = await loadHandler();
    const res = mockRes();
    await handler(mockReq('POST', { plan: 'monthly', couponCode: 'TRIAL7D' }) as any, res as any);

    const result = (res as any).getResult();
    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ trialApplied: true });
    expect(stripePromotionCodesList).not.toHaveBeenCalled();
    expect(stripeCouponsList).not.toHaveBeenCalled();
  });

  it('combines a real discount code with the default trial', async () => {
    stripePromotionCodesList.mockResolvedValue({ data: [{ id: 'promo_1' }] });

    const handler = await loadHandler();
    const res = mockRes();
    await handler(mockReq('POST', { plan: 'monthly', couponCode: 'SAVE20' }) as any, res as any);

    const result = (res as any).getResult();
    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ trialApplied: true });

    const params = stripeSessionCreate.mock.calls[0][0];
    expect(params.subscription_data?.trial_period_days).toBe(7);
    expect(params.discounts).toEqual([{ promotion_code: 'promo_1' }]);
    expect(params.allow_promotion_codes).toBeUndefined();
  });

  it('uses PLN price IDs when checkout is on tutlio.pl', async () => {
    process.env.STRIPE_MONTHLY_PRICE_ID_PLN = 'price_monthly_pln';
    stripePriceRetrieve.mockResolvedValue({
      id: 'price_monthly_pln',
      type: 'recurring',
      recurring: { interval: 'month' },
    });

    const handler = await loadHandler();
    const res = mockRes();
    await handler(
      mockReq('POST', { plan: 'monthly' }, { host: 'www.tutlio.pl', 'x-forwarded-host': 'www.tutlio.pl' }) as any,
      res as any,
    );

    expect((res as any).getResult().statusCode).toBe(200);
    expect(stripePriceRetrieve).toHaveBeenCalledWith('price_monthly_pln');
    expect(stripeSessionCreate.mock.calls[0][0].line_items[0].price).toBe('price_monthly_pln');
  });
});
