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

const accountLinkCreate = vi.fn();
vi.mock('stripe', () => {
  class StripeMock {
    accounts = {
      create: vi.fn(),
      retrieve: vi.fn(),
      createLoginLink: vi.fn(),
    };
    accountLinks = { create: accountLinkCreate };
  }
  return { default: StripeMock };
});

const orgAdminMaybeSingle = vi.fn();
const organizationSingle = vi.fn();
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
        eq: vi.fn(() => ({ single: organizationSingle })),
      })),
      update: vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) })),
    };
  }
  return {};
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from })),
}));

describe('POST /api/stripe-connect access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.STRIPE_SECRET_KEY = 'sk_test';
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
    verifyRequestAuth.mockResolvedValue({ userId: 'admin-1', isInternal: false });
    organizationSingle.mockResolvedValue({ data: { stripe_account_id: 'acct_org' }, error: null });
    accountLinkCreate.mockResolvedValue({ url: 'https://connect.stripe.test/onboard' });
  });

  it('rejects a suspended organization seat', async () => {
    orgAdminMaybeSingle.mockResolvedValue({
      data: {
        id: 'seat-1',
        user_id: 'admin-1',
        organization_id: 'org-1',
        role: 'admin',
        status: 'suspended',
        permissions: { 'finance.edit': true },
        accepted_at: '2026-08-01T00:00:00.000Z',
      },
      error: null,
    });
    const handler = (await import('../../api/stripe-connect')).default;
    const res = mockRes();

    await handler({
      method: 'POST',
      headers: { host: 'tutlio.lt' },
      body: { action: 'onboard', entity: 'org', entityId: 'org-1' },
    } as any, res as any);

    expect(res.getResult().statusCode).toBe(403);
    expect(accountLinkCreate).not.toHaveBeenCalled();
  });

  it('rejects an active finance admin targeting another organization', async () => {
    orgAdminMaybeSingle.mockResolvedValue({
      data: {
        id: 'seat-1',
        user_id: 'admin-1',
        organization_id: 'org-1',
        role: 'accountant',
        status: 'active',
        permissions: { 'finance.view': true, 'finance.edit': true },
        accepted_at: '2026-08-01T00:00:00.000Z',
      },
      error: null,
    });
    const handler = (await import('../../api/stripe-connect')).default;
    const res = mockRes();

    await handler({
      method: 'POST',
      headers: { host: 'tutlio.lt' },
      body: { action: 'onboard', entity: 'org', entityId: 'org-2' },
    } as any, res as any);

    expect(res.getResult().statusCode).toBe(403);
    expect(accountLinkCreate).not.toHaveBeenCalled();
  });

  it('allows a finance admin to onboard its own organization', async () => {
    orgAdminMaybeSingle.mockResolvedValue({
      data: {
        id: 'seat-1',
        user_id: 'admin-1',
        organization_id: 'org-1',
        role: 'accountant',
        status: 'active',
        permissions: { 'finance.view': true, 'finance.edit': true },
        accepted_at: '2026-08-01T00:00:00.000Z',
      },
      error: null,
    });
    const handler = (await import('../../api/stripe-connect')).default;
    const res = mockRes();

    await handler({
      method: 'POST',
      headers: { host: 'tutlio.lt', 'x-forwarded-proto': 'https' },
      body: {
        action: 'onboard',
        entity: 'org',
        entityId: 'org-1',
        returnUrl: 'https://tutlio.lt/company/finance',
      },
    } as any, res as any);

    expect(res.getResult()).toMatchObject({
      statusCode: 200,
      body: { url: 'https://connect.stripe.test/onboard' },
    });
    expect(accountLinkCreate).toHaveBeenCalledWith(expect.objectContaining({
      account: 'acct_org',
      return_url: 'https://tutlio.lt/company/finance?stripe=success',
    }));
  });
});
