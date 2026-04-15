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

function mockReq(method: string, body?: unknown) {
  return {
    method,
    body,
    headers: { 'content-type': 'application/json' },
    query: {},
  };
}

vi.mock('../../api/_lib/auth', () => ({
  verifyRequestAuth: vi.fn().mockResolvedValue({ userId: 'test-user', isInternal: false }),
}));

const stripeCreate = vi.fn();
vi.mock('stripe', () => {
  class StripeMock {
    checkout = {
      sessions: {
        create: stripeCreate,
      },
    };
    constructor(_key: string, _opts: any) {}
  }

  return { default: StripeMock };
});

const sessionsSingle = vi.fn();
const organizationsSingle = vi.fn();
const sessionsUpdateEq = vi.fn();
const studentsUpdateEq = vi.fn();

const from = vi.fn((table: string) => {
  if (table === 'sessions') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: sessionsSingle,
        })),
      })),
      update: vi.fn(() => ({
        eq: sessionsUpdateEq,
      })),
    };
  }

  if (table === 'organizations') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: organizationsSingle,
        })),
      })),
    };
  }

  if (table === 'students') {
    return {
      update: vi.fn(() => ({
        eq: studentsUpdateEq,
      })),
    };
  }

  return {};
});

const createClient = vi.fn(() => ({ from }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

describe('POST /api/stripe-checkout', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key';

    sessionsUpdateEq.mockResolvedValue({ data: null, error: null });
    studentsUpdateEq.mockResolvedValue({ data: null, error: null });
  });

  it('returns 400 when sessionId is missing (body undefined)', async () => {
    const handler = (await import('../../api/stripe-checkout')).default;
    const res = mockRes();

    await handler(mockReq('POST') as any, res as any);

    const result = (res as any).getResult();
    expect(result.statusCode).toBe(400);
    expect(result.body?.error).toBe('sessionId is required');
  });

  it('returns 500 with clear error when STRIPE_SECRET_KEY is missing', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const handler = (await import('../../api/stripe-checkout')).default;
    const res = mockRes();

    await handler(mockReq('POST', { sessionId: 'sess-1' }) as any, res as any);

    const result = (res as any).getResult();
    expect(result.statusCode).toBe(500);
    expect(result.body?.error).toBe('Missing STRIPE_SECRET_KEY');
  });

  it('creates checkout and stores stripe session id for individual tutor', async () => {
    sessionsSingle.mockResolvedValue({
      data: {
        id: 'sess-1',
        price: 25,
        topic: 'Matematika',
        tutor_id: 'tutor-1',
        student_id: 'student-1',
        students: {
          id: 'student-1',
          full_name: 'Mokinys',
          payment_payer: 'parent',
          payer_email: 'parent@example.com',
          credit_balance: 0,
        },
        profiles: {
          stripe_account_id: 'acct_individual',
          stripe_onboarding_complete: true,
          organization_id: null,
          full_name: 'Tutor Name',
        },
      },
      error: null,
    });

    stripeCreate.mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.test/cs_test_123',
    });

    const handler = (await import('../../api/stripe-checkout')).default;
    const res = mockRes();

    await handler(
      mockReq('POST', { sessionId: 'sess-1', payerEmail: 'parent@example.com' }) as any,
      res as any
    );

    const result = (res as any).getResult();
    expect(result.statusCode).toBe(200);
    expect(result.body?.url).toBe('https://checkout.stripe.test/cs_test_123');
    expect(result.body?.creditApplied).toBe(0);
    expect(stripeCreate).toHaveBeenCalledTimes(1);
    expect(stripeCreate.mock.calls[0][0]?.payment_intent_data?.transfer_data?.destination).toBe(
      'acct_individual'
    );
    expect(sessionsUpdateEq).toHaveBeenCalledWith('id', 'sess-1');
  });

  it('returns 400 when organization stripe onboarding is incomplete', async () => {
    sessionsSingle.mockResolvedValue({
      data: {
        id: 'sess-2',
        price: 25,
        topic: 'Fizika',
        student_id: 'student-1',
        students: { id: 'student-1', full_name: 'Mokinys', payer_email: 'parent@example.com', credit_balance: 0 },
        profiles: {
          stripe_account_id: null,
          stripe_onboarding_complete: false,
          organization_id: 'org-1',
          full_name: 'Org Tutor',
        },
      },
      error: null,
    });

    organizationsSingle.mockResolvedValue({
      data: {
        stripe_account_id: null,
        stripe_onboarding_complete: false,
        name: 'Test Org',
      },
      error: null,
    });

    const handler = (await import('../../api/stripe-checkout')).default;
    const res = mockRes();

    await handler(mockReq('POST', { sessionId: 'sess-2' }) as any, res as any);

    const result = (res as any).getResult();
    expect(result.statusCode).toBe(400);
    expect(result.body?.error).toContain('Stripe');
  });

  it('fully covers lesson with credit balance (no Stripe charge)', async () => {
    sessionsSingle.mockResolvedValue({
      data: {
        id: 'sess-credit',
        price: 15,
        topic: 'Anglų kalba',
        tutor_id: 'tutor-1',
        student_id: 'student-credit',
        students: {
          id: 'student-credit',
          full_name: 'Kredito Mokinys',
          payment_payer: 'self',
          payer_email: null,
          credit_balance: 20,
        },
        profiles: {
          stripe_account_id: 'acct_individual',
          stripe_onboarding_complete: true,
          organization_id: null,
          full_name: 'Tutor Name',
        },
      },
      error: null,
    });

    const handler = (await import('../../api/stripe-checkout')).default;
    const res = mockRes();

    await handler(mockReq('POST', { sessionId: 'sess-credit' }) as any, res as any);

    const result = (res as any).getResult();
    expect(result.statusCode).toBe(200);
    expect(result.body?.creditFullyCovered).toBe(true);
    expect(result.body?.creditApplied).toBe(15);
    expect(stripeCreate).not.toHaveBeenCalled();
  });

  it('partially applies credit and reduces Stripe charge', async () => {
    sessionsSingle.mockResolvedValue({
      data: {
        id: 'sess-partial',
        price: 25,
        topic: 'Fizika',
        tutor_id: 'tutor-1',
        student_id: 'student-partial',
        students: {
          id: 'student-partial',
          full_name: 'Dalinis Mokinys',
          payment_payer: 'self',
          payer_email: null,
          credit_balance: 7.5,
        },
        profiles: {
          stripe_account_id: 'acct_individual',
          stripe_onboarding_complete: true,
          organization_id: null,
          full_name: 'Tutor Name',
        },
      },
      error: null,
    });

    stripeCreate.mockResolvedValue({
      id: 'cs_partial_123',
      url: 'https://checkout.stripe.test/cs_partial_123',
    });

    const handler = (await import('../../api/stripe-checkout')).default;
    const res = mockRes();

    await handler(mockReq('POST', { sessionId: 'sess-partial' }) as any, res as any);

    const result = (res as any).getResult();
    expect(result.statusCode).toBe(200);
    expect(result.body?.url).toBe('https://checkout.stripe.test/cs_partial_123');
    expect(result.body?.creditApplied).toBe(7.5);
    expect(stripeCreate).toHaveBeenCalledTimes(1);

    const stripeArgs = stripeCreate.mock.calls[0][0];
    const lessonLineItem = stripeArgs.line_items[0];
    const reducedPriceEur = 25 - 7.5;
    const expectedCents = Math.round(reducedPriceEur * 100);
    expect(lessonLineItem.price_data.unit_amount).toBe(expectedCents);
  });

  it('does not apply credits for penalty payments', async () => {
    sessionsSingle.mockResolvedValue({
      data: {
        id: 'sess-penalty',
        price: 25,
        topic: 'Matematika',
        tutor_id: 'tutor-1',
        student_id: 'student-penalty',
        students: {
          id: 'student-penalty',
          full_name: 'Baudos Mokinys',
          payment_payer: 'self',
          payer_email: null,
          credit_balance: 100,
        },
        profiles: {
          stripe_account_id: 'acct_individual',
          stripe_onboarding_complete: true,
          organization_id: null,
          full_name: 'Tutor Name',
        },
      },
      error: null,
    });

    stripeCreate.mockResolvedValue({
      id: 'cs_penalty_123',
      url: 'https://checkout.stripe.test/cs_penalty_123',
    });

    const handler = (await import('../../api/stripe-checkout')).default;
    const res = mockRes();

    await handler(mockReq('POST', { sessionId: 'sess-penalty', penaltyAmount: 12.5 }) as any, res as any);

    const result = (res as any).getResult();
    expect(result.statusCode).toBe(200);
    expect(result.body?.url).toBe('https://checkout.stripe.test/cs_penalty_123');
    expect(result.body?.creditApplied).toBe(0);

    const stripeArgs = stripeCreate.mock.calls[0][0];
    const lessonLineItem = stripeArgs.line_items[0];
    const expectedCents = Math.round(12.5 * 100);
    expect(lessonLineItem.price_data.unit_amount).toBe(expectedCents);
  });
});
