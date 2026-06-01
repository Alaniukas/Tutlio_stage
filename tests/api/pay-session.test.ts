import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mirrors the non-school fee model in api/pay-session.ts so we can assert the
// exact Stripe `amount_total` (in cents) the endpoint expects for a given price.
const PLATFORM_FEE_PERCENT = 0.02;
const STRIPE_FEE_PERCENT = 0.015;
const STRIPE_FEE_FIXED_EUR = 0.25;
function expectedTotalCents(priceEur: number): number {
  const total = (priceEur + priceEur * PLATFORM_FEE_PERCENT + STRIPE_FEE_FIXED_EUR) / (1 - STRIPE_FEE_PERCENT);
  return Math.round(total * 100);
}

function mockRes() {
  const out = { statusCode: 0, body: null as any, redirectStatus: 0, redirectedTo: null as string | null };
  const res: any = {
    status(code: number) { out.statusCode = code; return res; },
    json(body: any) { out.body = body; return res; },
    send(body: any) { out.body = body; return res; },
    redirect(code: number, url: string) { out.redirectStatus = code; out.redirectedTo = url; return res; },
    getResult: () => out,
  };
  return res;
}

function mockReq(method: string, session?: string) {
  return { method, query: session ? { session } : {}, headers: {} };
}

const stripeRetrieve = vi.fn();
const stripeExpire = vi.fn();
const stripeCreate = vi.fn();
vi.mock('stripe', () => {
  class StripeMock {
    checkout = {
      sessions: {
        retrieve: stripeRetrieve,
        expire: stripeExpire,
        create: stripeCreate,
      },
    };
    constructor(_key: string, _opts: any) {}
  }
  return { default: StripeMock };
});

const sessionsSingle = vi.fn();
const sessionsUpdateEq = vi.fn();
const studentsUpdateEq = vi.fn();

const from = vi.fn((table: string) => {
  if (table === 'sessions') {
    return {
      select: vi.fn(() => ({ eq: vi.fn(() => ({ single: sessionsSingle })) })),
      update: vi.fn(() => ({ eq: sessionsUpdateEq })),
    };
  }
  if (table === 'students') {
    return { update: vi.fn(() => ({ eq: studentsUpdateEq })) };
  }
  return {};
});

const createClient = vi.fn(() => ({ from }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

function sessionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sess-1',
    price: 50,
    topic: 'Matematika',
    student_id: 'student-1',
    tutor_id: 'tutor-1',
    start_time: '2026-06-01T10:00:00.000Z',
    paid: false,
    payment_status: 'pending',
    stripe_checkout_session_id: 'cs_old',
    students: {
      id: 'student-1',
      full_name: 'Mokinys',
      payment_payer: 'parent',
      payer_email: 'parent@example.com',
      payer_name: null,
      credit_balance: 0,
      payment_model: null,
    },
    profiles: {
      stripe_account_id: 'acct_individual',
      stripe_onboarding_complete: true,
      organization_id: null,
      full_name: 'Tutor Name',
      subscription_plan: null,
      manual_subscription_exempt: false,
      enable_manual_student_payments: false,
    },
    ...overrides,
  };
}

describe('GET /api/pay-session', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key';
    process.env.APP_URL = 'https://tutlio.test';

    sessionsUpdateEq.mockResolvedValue({ data: null, error: null });
    studentsUpdateEq.mockResolvedValue({ data: null, error: null });
    stripeExpire.mockResolvedValue({ id: 'cs_old', status: 'expired' });
  });

  it('expires a stale checkout and creates a fresh one when the lesson price changed', async () => {
    // Lesson now costs €50, but the existing open checkout was created for €25.
    sessionsSingle.mockResolvedValue({ data: sessionRow({ price: 50 }), error: null });
    stripeRetrieve.mockResolvedValue({
      id: 'cs_old',
      status: 'open',
      url: 'https://checkout.stripe.test/cs_old',
      amount_total: expectedTotalCents(25),
    });
    stripeCreate.mockResolvedValue({ id: 'cs_new', url: 'https://checkout.stripe.test/cs_new' });

    const handler = (await import('../../api/pay-session')).default;
    const res = mockRes();

    await handler(mockReq('GET', 'sess-1') as any, res as any);

    const result = (res as any).getResult();
    expect(stripeRetrieve).toHaveBeenCalledWith('cs_old');
    expect(stripeExpire).toHaveBeenCalledWith('cs_old');
    expect(stripeCreate).toHaveBeenCalledTimes(1);

    // The fresh checkout must charge the up-to-date €50 amount.
    const createArgs = stripeCreate.mock.calls[0][0];
    expect(createArgs.line_items[0].price_data.unit_amount).toBe(Math.round(50 * 100));

    expect(result.redirectStatus).toBe(303);
    expect(result.redirectedTo).toBe('https://checkout.stripe.test/cs_new');
  });

  it('reuses the existing checkout when its amount still matches the current price', async () => {
    sessionsSingle.mockResolvedValue({ data: sessionRow({ price: 25 }), error: null });
    stripeRetrieve.mockResolvedValue({
      id: 'cs_old',
      status: 'open',
      url: 'https://checkout.stripe.test/cs_old',
      amount_total: expectedTotalCents(25),
    });

    const handler = (await import('../../api/pay-session')).default;
    const res = mockRes();

    await handler(mockReq('GET', 'sess-1') as any, res as any);

    const result = (res as any).getResult();
    expect(stripeExpire).not.toHaveBeenCalled();
    expect(stripeCreate).not.toHaveBeenCalled();
    expect(result.redirectStatus).toBe(303);
    expect(result.redirectedTo).toBe('https://checkout.stripe.test/cs_old');
  });
});
