import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  is: vi.fn(),
}));

vi.mock('../../api/_lib/sendPendingPackageEmail.js', () => ({
  sendPendingPackagePaymentEmail: (...args: unknown[]) => mocks.send(...args),
}));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({
  getOrgAdminAccessByUserId: vi.fn(async () => ({
    organizationId: 'org-1', role: 'owner', permissions: {},
  })),
}));
vi.mock('../../src/lib/orgAdminPermissions.js', () => ({
  hasOrgAdminPermission: () => true,
}));
vi.mock('../../api/_lib/public-origin.js', () => ({
  publicOriginFromRequest: () => 'https://tutlio.lt',
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'admin-1' } }, error: null })) },
    from: () => {
      const chain: any = {
        update: vi.fn((...args: unknown[]) => {
          mocks.update(...args);
          return chain;
        }),
        eq: vi.fn((...args: unknown[]) => {
          mocks.eq(...args);
          return chain;
        }),
        is: vi.fn((...args: unknown[]) => {
          mocks.is(...args);
          return chain;
        }),
        then: (resolve: (value: unknown) => void) => resolve({ error: null }),
      };
      return chain;
    },
  }),
}));

function response() {
  const result = { statusCode: 0, body: null as any };
  const res: any = {
    setHeader: vi.fn(),
    status: vi.fn((statusCode: number) => {
      result.statusCode = statusCode;
      return res;
    }),
    send: vi.fn((body: string) => {
      result.body = JSON.parse(body);
      return res;
    }),
  };
  return { res, result };
}

describe('POST /api/resend-package-email', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
    mocks.send.mockResolvedValue({ ok: true });
  });

  it('records successful pooled delivery so the roster no longer says unsent', async () => {
    const { default: handler } = await import('../../api/resend-package-email');
    const { res, result } = response();
    await handler({
      method: 'POST', body: { packageId: 'pkg-1' }, query: {},
      headers: { authorization: 'Bearer token' },
    } as any, res);

    expect(result).toMatchObject({ statusCode: 200, body: { success: true } });
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      pool_email_sent_at: expect.any(String),
      pool_email_claimed_at: null,
    }));
    expect(mocks.eq).toHaveBeenCalledWith('pool_organization_id', 'org-1');
    expect(mocks.is).toHaveBeenCalledWith('pool_email_sent_at', null);
  });
});
