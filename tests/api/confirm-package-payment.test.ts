import { describe, it, expect, vi, beforeEach } from 'vitest';

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

function mockReq(body: unknown) {
  return {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json' },
    query: {},
  };
}

// ---- Stripe mock ----
const stripeRetrieve = vi.fn();
vi.mock('stripe', () => {
  class StripeMock {
    checkout = {
      sessions: {
        retrieve: stripeRetrieve,
      },
    };
    constructor(_key: string, _opts: any) {}
  }
  return { default: StripeMock };
});

// ---- Supabase mock ----
type Chain = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
};

const chain: Chain = {
  select: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
};

const updateChain: any = {
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
};

const from = vi.fn((table: string) => {
  if (table === 'lesson_packages') {
    // handler uses .select(...).eq(...).single() and later .update(...).eq(...).select(...).single()
    const obj: any = {
      select: chain.select,
      eq: chain.eq,
      single: chain.single,
      update: updateChain.update,
    };
    return obj;
  }
  return {} as any;
});

const createClient = vi.fn(() => ({ from }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

describe('POST /api/confirm-package-payment', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_key';

    chain.select.mockReturnThis();
    chain.eq.mockReturnThis();
    updateChain.eq.mockReturnThis();
    updateChain.select.mockReturnThis();
  });

  it('activates package when Stripe checkout is paid', async () => {
    stripeRetrieve.mockResolvedValue({
      payment_status: 'paid',
      metadata: { tutlio_package_id: 'pkg-1' },
    });

    chain.single.mockResolvedValue({
      data: { id: 'pkg-1', paid: false, active: false, payment_status: 'pending', paid_at: null, available_lessons: 1, total_lessons: 1, subjects: { name: 'Bandomoji pamoka' } },
      error: null,
    });

    updateChain.update.mockReturnValue(updateChain);
    updateChain.single.mockResolvedValue({
      data: { id: 'pkg-1', available_lessons: 1, total_lessons: 1, subjects: { name: 'Bandomoji pamoka' } },
      error: null,
    });

    const handler = (await import('../../api/confirm-package-payment')).default;
    const res = mockRes();
    await handler(mockReq({ sessionId: 'cs_test_123' }) as any, res as any);

    const result = (res as any).getResult();
    expect(result.statusCode).toBe(200);
    expect(result.body?.success).toBe(true);

    // Ensure we don't pin to FK constraint name in select
    const selectArg = chain.select.mock.calls[0]?.[0] as string;
    expect(selectArg).toContain('students(');
    expect(selectArg).toContain('subjects(');
    expect(selectArg).not.toContain('!lesson_packages_tutor_id_fkey');
  });

  it('returns 400 if Stripe checkout is not paid', async () => {
    stripeRetrieve.mockResolvedValue({
      payment_status: 'unpaid',
      metadata: { tutlio_package_id: 'pkg-1' },
    });

    const handler = (await import('../../api/confirm-package-payment')).default;
    const res = mockRes();
    await handler(mockReq({ sessionId: 'cs_test_123' }) as any, res as any);

    const result = (res as any).getResult();
    expect(result.statusCode).toBe(400);
    expect(result.body?.error).toBeTruthy();
  });
});

