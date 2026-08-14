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

const authGetUser = vi.fn();
const orgAdminMaybeSingle = vi.fn();
const orgMaybeSingle = vi.fn();

const from = vi.fn((table: string) => {
  if (table === 'organization_admins') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: orgAdminMaybeSingle })),
      })),
    };
  }
  if (table === 'organizations') {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: orgMaybeSingle })),
      })),
    };
  }
  return {};
});

const createClient = vi.fn(() => ({ from, auth: { getUser: authGetUser } }));
vi.mock('@supabase/supabase-js', () => ({ createClient }));

async function loadHandler() {
  return (await import('../../api/create-enterprise-checkout')).default;
}

describe('POST /api/create-enterprise-checkout', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.VITE_SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key';
    process.env.STRIPE_ENTERPRISE_PRICE_ID = 'price_enterprise_test';
    delete process.env.ENTERPRISE_MIN_LICENSES;
    delete process.env.ENTERPRISE_MAX_SELF_SERVE_LICENSES;

    stripeCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/test-session' });
  });

  it('returns 405 for non-POST', async () => {
    const handler = await loadHandler();
    const res = mockRes();
    await handler(mockReq('GET') as any, res as any);
    expect((res as any).getResult().statusCode).toBe(405);
  });

  it('rejects license counts below the minimum', async () => {
    const handler = await loadHandler();
    const res = mockRes();
    await handler(mockReq('POST', { licenseCount: 0, companyName: 'Acme' }) as any, res as any);
    expect((res as any).getResult().statusCode).toBe(400);
  });

  it('rejects license counts above the self-serve cap', async () => {
    const handler = await loadHandler();
    const res = mockRes();
    await handler(mockReq('POST', { licenseCount: 201, companyName: 'Acme' }) as any, res as any);
    expect((res as any).getResult().statusCode).toBe(400);
  });

  it('respects ENTERPRISE_MAX_SELF_SERVE_LICENSES override', async () => {
    process.env.ENTERPRISE_MAX_SELF_SERVE_LICENSES = '50';
    const handler = await loadHandler();
    const res = mockRes();
    await handler(mockReq('POST', { licenseCount: 51, companyName: 'Acme' }) as any, res as any);
    expect((res as any).getResult().statusCode).toBe(400);
  });

  it('rejects non-numeric license counts', async () => {
    const handler = await loadHandler();
    const res = mockRes();
    await handler(mockReq('POST', { licenseCount: 'abc', companyName: 'Acme' }) as any, res as any);
    expect((res as any).getResult().statusCode).toBe(400);
  });

  it('returns 500 when STRIPE_ENTERPRISE_PRICE_ID is missing', async () => {
    delete process.env.STRIPE_ENTERPRISE_PRICE_ID;
    const handler = await loadHandler();
    const res = mockRes();
    await handler(mockReq('POST', { licenseCount: 10, companyName: 'Acme' }) as any, res as any);
    expect((res as any).getResult().statusCode).toBe(500);
  });

  it('requires a company name for anonymous purchases', async () => {
    const handler = await loadHandler();
    const res = mockRes();
    await handler(mockReq('POST', { licenseCount: 10 }) as any, res as any);
    const result = (res as any).getResult();
    expect(result.statusCode).toBe(400);
    expect(result.body?.code).toBe('COMPANY_NAME_REQUIRED');
  });

  it('creates an anonymous checkout with company metadata and quantity', async () => {
    const handler = await loadHandler();
    const res = mockRes();
    await handler(
      mockReq('POST', { licenseCount: 25, companyName: 'Acme School', locale: 'en' }) as any,
      res as any,
    );

    const result = (res as any).getResult();
    expect(result.statusCode).toBe(200);
    expect(result.body?.url).toBe('https://checkout.stripe.com/test-session');

    const params = stripeCreate.mock.calls[0][0];
    expect(params.mode).toBe('subscription');
    expect(params.line_items[0]).toMatchObject({ price: 'price_enterprise_test', quantity: 25 });
    expect(params.metadata).toMatchObject({
      tutlio_enterprise: '1',
      company_name: 'Acme School',
      license_count: '25',
    });
    expect(params.subscription_data.metadata).toMatchObject({ tutlio_enterprise: '1' });
    expect(params.metadata.organization_id).toBeUndefined();
    expect(params.success_url).toContain('/enterprise/success');
    expect(params.success_url).toContain('flow=new');
    expect(params.cancel_url).toContain('audience=agency');
  });

  it('attaches the organization for a logged-in org admin and reuses the Stripe customer', async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: 'admin-1', email: 'admin@acme.lt' } }, error: null });
    orgAdminMaybeSingle.mockResolvedValue({
      data: {
        id: 'seat-1',
        user_id: 'admin-1',
        organization_id: 'org-1',
        role: 'owner',
        status: 'active',
        permissions: {},
        accepted_at: '2026-08-01T00:00:00.000Z',
      },
      error: null,
    });
    orgMaybeSingle.mockResolvedValue({
      data: {
        id: 'org-1',
        stripe_customer_id: 'cus_existing',
        license_subscription_id: null,
        license_subscription_status: null,
      },
      error: null,
    });

    const handler = await loadHandler();
    const res = mockRes();
    await handler(
      mockReq('POST', { licenseCount: 12 }, { authorization: 'Bearer token-123' }) as any,
      res as any,
    );

    const result = (res as any).getResult();
    expect(result.statusCode).toBe(200);

    const params = stripeCreate.mock.calls[0][0];
    expect(params.metadata).toMatchObject({ tutlio_enterprise: '1', organization_id: 'org-1' });
    expect(params.customer).toBe('cus_existing');
    expect(params.line_items[0].quantity).toBe(12);
    expect(params.success_url).toContain('flow=org');
  });

  it('returns 409 when the org already has an active license subscription', async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: 'admin-1', email: 'admin@acme.lt' } }, error: null });
    orgAdminMaybeSingle.mockResolvedValue({
      data: {
        id: 'seat-1',
        user_id: 'admin-1',
        organization_id: 'org-1',
        role: 'owner',
        status: 'active',
        permissions: {},
        accepted_at: '2026-08-01T00:00:00.000Z',
      },
      error: null,
    });
    orgMaybeSingle.mockResolvedValue({
      data: {
        id: 'org-1',
        stripe_customer_id: 'cus_existing',
        license_subscription_id: 'sub_active',
        license_subscription_status: 'active',
      },
      error: null,
    });

    const handler = await loadHandler();
    const res = mockRes();
    await handler(
      mockReq('POST', { licenseCount: 12 }, { authorization: 'Bearer token-123' }) as any,
      res as any,
    );

    const result = (res as any).getResult();
    expect(result.statusCode).toBe(409);
    expect(result.body?.code).toBe('HAS_ACTIVE_LICENSE_SUBSCRIPTION');
    expect(stripeCreate).not.toHaveBeenCalled();
  });

  it('treats a logged-in non-admin user as an anonymous buyer (company name required)', async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: 'tutor-1', email: 'tutor@x.lt' } }, error: null });
    orgAdminMaybeSingle.mockResolvedValue({ data: null, error: null });

    const handler = await loadHandler();
    const res = mockRes();
    await handler(
      mockReq('POST', { licenseCount: 5 }, { authorization: 'Bearer token-123' }) as any,
      res as any,
    );

    const result = (res as any).getResult();
    expect(result.statusCode).toBe(400);
    expect(result.body?.code).toBe('COMPANY_NAME_REQUIRED');
  });

  it('rejects an organization seat without settings edit permission', async () => {
    authGetUser.mockResolvedValue({ data: { user: { id: 'accountant-1', email: 'finance@acme.lt' } }, error: null });
    orgAdminMaybeSingle.mockResolvedValue({
      data: {
        id: 'seat-2',
        user_id: 'accountant-1',
        organization_id: 'org-1',
        role: 'accountant',
        status: 'active',
        permissions: { 'finance.view': true, 'finance.edit': true },
        accepted_at: '2026-08-01T00:00:00.000Z',
      },
      error: null,
    });

    const handler = await loadHandler();
    const res = mockRes();
    await handler(
      mockReq('POST', { licenseCount: 5, companyName: 'Should not create' }, { authorization: 'Bearer token-123' }) as any,
      res as any,
    );

    expect((res as any).getResult().statusCode).toBe(403);
    expect(stripeCreate).not.toHaveBeenCalled();
  });

  it('uses PLN enterprise price on tutlio.pl', async () => {
    process.env.STRIPE_ENTERPRISE_PRICE_ID_PLN = 'price_enterprise_pln';
    const handler = await loadHandler();
    const res = mockRes();
    await handler(
      mockReq('POST', { licenseCount: 10, companyName: 'Szkoła PL' }, { host: 'www.tutlio.pl', 'x-forwarded-host': 'www.tutlio.pl' }) as any,
      res as any,
    );

    expect((res as any).getResult().statusCode).toBe(200);
    expect(stripeCreate.mock.calls[0][0].line_items[0].price).toBe('price_enterprise_pln');
  });
});
