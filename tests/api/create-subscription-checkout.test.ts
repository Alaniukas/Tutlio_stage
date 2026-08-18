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
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_123';
    process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key';
    process.env.STRIPE_MONTHLY_PRICE_ID = 'price_monthly_test';
    process.env.STRIPE_YEARLY_PRICE_ID = 'price_yearly_test';
    process.env.STRIPE_SUBSCRIPTION_ONLY_PRICE_ID = 'price_subonly_test';
    process.env.STRIPE_SUBSCRIPTION_ONLY_YEARLY_PRICE_ID = 'price_subonly_yearly_test';
    process.env.STRIPE_ENTERPRISE_PRICE_ID = 'price_enterprise_test';

    stripeSessionCreate.mockResolvedValue({
      id: 'csess_test_123',
      url: 'https://checkout.stripe.com/test-session',
      client_secret: 'cs_test_embedded',
    });
    stripePriceRetrieve.mockResolvedValue({
      id: 'price_monthly_test',
      type: 'recurring',
      recurring: { interval: 'month' },
      product: 'prod_UOWf5Nqxf1wPIg',
    });
    stripePricesList.mockResolvedValue({ data: [] });
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

  it('creates an embedded session without external completion redirects', async () => {
    const handler = await loadHandler();
    const res = mockRes();
    await handler(mockReq('POST', { plan: 'monthly', uiMode: 'embedded' }) as any, res as any);

    const result = (res as any).getResult();
    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      clientSecret: 'cs_test_embedded',
      publishableKey: 'pk_test_123',
      trialApplied: true,
      trialDays: 7,
    });
    const completionUrl = new URL(result.body.completionUrl);
    expect(completionUrl.pathname).toBe('/register');
    expect(completionUrl.searchParams.get('subscription_success')).toBe('true');
    expect(completionUrl.searchParams.get('session_id')).toBe('csess_test_123');
    expect(result.body.url).toBeUndefined();

    const params = stripeSessionCreate.mock.calls[0][0];
    expect(params.ui_mode).toBe('embedded');
    expect(params.redirect_on_completion).toBe('never');
    expect(params.success_url).toBeUndefined();
    expect(params.cancel_url).toBeUndefined();
    expect(params.payment_method_types).toEqual(['card', 'link']);
  });

  it('keeps hosted checkout as the default', async () => {
    const handler = await loadHandler();
    const res = mockRes();
    await handler(mockReq('POST', { plan: 'monthly' }) as any, res as any);

    const result = (res as any).getResult();
    expect(result.body.url).toBe('https://checkout.stripe.com/test-session');
    const params = stripeSessionCreate.mock.calls[0][0];
    expect(params.ui_mode).toBeUndefined();
    expect(params.success_url).toBeTruthy();
    expect(params.cancel_url).toBeTruthy();
    expect(params.payment_method_types).toEqual(['card', 'link', 'revolut_pay']);
  });

  it('falls back to hosted checkout when the embedded publishable key is missing', async () => {
    delete process.env.STRIPE_PUBLISHABLE_KEY;
    const handler = await loadHandler();
    const res = mockRes();
    await handler(mockReq('POST', { plan: 'monthly', uiMode: 'embedded' }) as any, res as any);

    const result = (res as any).getResult();
    expect(result.statusCode).toBe(200);
    expect(result.body.url).toBe('https://checkout.stripe.com/test-session');
    const params = stripeSessionCreate.mock.calls[0][0];
    expect(params.ui_mode).toBeUndefined();
    expect(params.success_url).toBeTruthy();
  });

  it('returns hosted quiz checkout to the exact offer page when Stripe back is clicked', async () => {
    delete process.env.STRIPE_PUBLISHABLE_KEY;
    const handler = await loadHandler();
    const res = mockRes();
    await handler(
      mockReq(
        'POST',
        {
          plan: 'monthly',
          uiMode: 'embedded',
          locale: 'en',
          cancelPath: '/en/quiz/solo/offer?source=quiz#plans',
        },
        { host: 'www.tutlio.com', 'x-forwarded-host': 'www.tutlio.com' },
      ) as any,
      res as any,
    );

    expect((res as any).getResult().statusCode).toBe(200);
    expect(stripeSessionCreate.mock.calls[0][0].cancel_url).toBe(
      'https://www.tutlio.com/en/quiz/solo/offer?source=quiz&canceled=1#plans',
    );
  });

  it.each([
    'https://attacker.example/quiz/solo/offer',
    '//attacker.example/quiz/solo/offer',
  ])('rejects an external hosted Checkout cancellation target: %s', async (cancelPath) => {
    const handler = await loadHandler();
    const res = mockRes();
    await handler(
      mockReq(
        'POST',
        { plan: 'monthly', cancelPath },
        { host: 'www.tutlio.com', 'x-forwarded-host': 'www.tutlio.com' },
      ) as any,
      res as any,
    );

    expect((res as any).getResult().statusCode).toBe(200);
    expect(stripeSessionCreate.mock.calls[0][0].cancel_url).toBe(
      'https://www.tutlio.com/pricing?canceled=1',
    );
  });

  it('applies the default trial to recurring yearly and subscription_only plans', async () => {
    const handler = await loadHandler();
    for (const plan of ['yearly', 'subscription_only'] as const) {
      stripePriceRetrieve.mockResolvedValueOnce({
        id: plan === 'yearly' ? 'price_yearly_test' : 'price_subonly_test',
        type: 'recurring',
        recurring: { interval: plan === 'yearly' ? 'year' : 'month' },
        product: plan === 'subscription_only' ? 'prod_UOWf5Nqxf1wPIg' : 'prod_standard_yearly',
      });
      const res = mockRes();
      await handler(mockReq('POST', { plan }) as any, res as any);
      expect((res as any).getResult().body).toMatchObject({ trialApplied: true, trialDays: 7 });
    }
    for (const call of stripeSessionCreate.mock.calls) {
      expect(call[0].subscription_data?.trial_period_days).toBe(7);
    }
  });

  it('creates a yearly no-commission subscription with the annual price', async () => {
    stripePriceRetrieve.mockResolvedValue({
      id: 'price_subonly_yearly_test',
      type: 'recurring',
      recurring: { interval: 'year' },
      product: 'prod_UOWf5Nqxf1wPIg',
    });
    const handler = await loadHandler();
    const res = mockRes();
    await handler(mockReq('POST', { plan: 'subscription_only_yearly', uiMode: 'embedded' }) as any, res as any);

    expect((res as any).getResult().statusCode).toBe(200);
    expect(stripePriceRetrieve).toHaveBeenCalledWith('price_subonly_yearly_test');
    expect(stripeSessionCreate.mock.calls[0][0]).toMatchObject({
      mode: 'subscription',
      line_items: [{ price: 'price_subonly_yearly_test', quantity: 1 }],
      metadata: { tutlio_plan: 'subscription_only' },
      subscription_data: {
        trial_period_days: 7,
        metadata: { tutlio_plan: 'subscription_only' },
      },
    });
  });

  it('refuses an enterprise price miswired as the monthly subscription-only plan', async () => {
    process.env.STRIPE_SUBSCRIPTION_ONLY_PRICE_ID = 'price_enterprise_test';
    stripePriceRetrieve.mockResolvedValueOnce({
      id: 'price_enterprise_test',
      type: 'recurring',
      recurring: { interval: 'month' },
      product: 'prod_enterprise_test',
    });
    stripePricesList.mockResolvedValueOnce({
      data: [{
        id: 'price_subscription_only_fallback',
        type: 'recurring',
        recurring: { interval: 'month' },
        product: 'prod_UOWf5Nqxf1wPIg',
      }],
    });

    const handler = await loadHandler();
    const res = mockRes();
    await handler(mockReq('POST', { plan: 'subscription_only' }) as any, res as any);

    expect((res as any).getResult().statusCode).toBe(200);
    expect(stripePricesList).toHaveBeenCalledWith({
      product: 'prod_UOWf5Nqxf1wPIg',
      active: true,
      limit: 20,
    });
    expect(stripeSessionCreate.mock.calls[0][0].line_items).toEqual([
      { price: 'price_subscription_only_fallback', quantity: 1 },
    ]);
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

  it('extends the free trial to 14 days when TRIAL14D is supplied', async () => {
    const handler = await loadHandler();
    const res = mockRes();
    await handler(mockReq('POST', { plan: 'monthly', couponCode: ' trial14d ' }) as any, res as any);

    const result = (res as any).getResult();
    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ trialApplied: true, trialDays: 14 });

    const params = stripeSessionCreate.mock.calls[0][0];
    expect(params.subscription_data?.trial_period_days).toBe(14);
    expect(params.subscription_data?.metadata?.tutlio_trial_days).toBe('14');
    expect(params.metadata?.tutlio_trial).toBe('14d');
    expect(params.cancel_url).toContain('/pricing?canceled=1&promo=TRIAL14D');
    expect(params.allow_promotion_codes).toBe(true);
    expect(stripePromotionCodesList).not.toHaveBeenCalled();
    expect(stripeCouponsList).not.toHaveBeenCalled();
  });

  it('preserves TRIAL14D in a localized Stripe cancellation return URL', async () => {
    const handler = await loadHandler();
    const res = mockRes();
    await handler(
      mockReq(
        'POST',
        { plan: 'monthly', couponCode: 'TRIAL14D', locale: 'fr' },
        { host: 'www.tutlio.com', 'x-forwarded-host': 'www.tutlio.com' },
      ) as any,
      res as any,
    );

    expect((res as any).getResult().statusCode).toBe(200);
    expect(stripeSessionCreate.mock.calls[0][0].cancel_url)
      .toBe('https://www.tutlio.com/fr/pricing?canceled=1&promo=TRIAL14D');
  });

  it('rejects TRIAL14D when the account has already used its free trial', async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'a@b.lt' } }, error: null });
    profileSingle.mockResolvedValue({ data: { trial_used: true }, error: null });

    const handler = await loadHandler();
    const res = mockRes();
    await handler(
      mockReq(
        'POST',
        { plan: 'monthly', couponCode: 'TRIAL14D', startTrial: false },
        { authorization: 'Bearer token' },
      ) as any,
      res as any,
    );

    expect((res as any).getResult().statusCode).toBe(400);
    expect(stripeSessionCreate).not.toHaveBeenCalled();
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
