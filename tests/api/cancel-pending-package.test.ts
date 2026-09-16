import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pkg: {} as any,
  tutor: { organization_id: 'org-1' } as any,
  rpc: vi.fn(),
  retrieve: vi.fn(),
  expire: vi.fn(),
  resolveAccount: vi.fn(),
  requireAccess: vi.fn(),
}));

vi.mock('stripe', () => ({ default: class StripeMock {} }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    rpc: mocks.rpc,
    from: (table: string) => {
      const row = table === 'lesson_packages' ? mocks.pkg : mocks.tutor;
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => ({ data: row, error: null })),
      };
      return chain;
    },
  }),
}));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({
  requireOrgAdminAccess: (...args: unknown[]) => mocks.requireAccess(...args),
}));
vi.mock('../../api/_lib/stripeDirectCharge.js', () => ({
  retrieveConnectCheckoutSessionWithScope: (...args: unknown[]) => mocks.retrieve(...args),
  expireConnectCheckoutSession: (...args: unknown[]) => mocks.expire(...args),
  resolveTutorStripeAccount: (...args: unknown[]) => mocks.resolveAccount(...args),
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

async function cancelPackage() {
  const { default: handler } = await import('../../api/cancel-pending-package');
  const { res, result } = response();
  await handler({ method: 'POST', body: { packageId: 'pkg-1' }, headers: {}, query: {} } as any, res);
  return result;
}

describe('POST /api/cancel-pending-package', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
    process.env.STRIPE_SECRET_KEY = 'sk_test';
    mocks.pkg = {
      id: 'pkg-1', tutor_id: 'tutor-1', paid: false, payment_status: 'pending',
      stripe_checkout_session_id: 'cs_open', pool_organization_id: 'org-1',
    };
    mocks.tutor = { organization_id: 'org-1' };
    mocks.requireAccess.mockResolvedValue({
      ok: true,
      access: { organizationId: 'org-1', userId: 'admin-1' },
    });
    mocks.resolveAccount.mockResolvedValue('acct_org');
    mocks.retrieve.mockResolvedValue({
      session: { status: 'open', payment_status: 'unpaid' },
      stripeAccount: 'acct_org',
    });
    mocks.expire.mockResolvedValue({ status: 'expired' });
    mocks.rpc.mockResolvedValue({ data: 'pkg-1', error: null });
  });

  it('expires an open Checkout Session before atomically cancelling the DB package', async () => {
    expect(await cancelPackage()).toMatchObject({ statusCode: 200, body: { success: true } });
    expect(mocks.expire).toHaveBeenCalledWith(expect.anything(), 'cs_open', 'acct_org');
    expect(mocks.expire.mock.invocationCallOrder[0]).toBeLessThan(mocks.rpc.mock.invocationCallOrder[0]);
    expect(mocks.rpc).toHaveBeenCalledWith('cancel_pending_lesson_package', {
      p_package_id: 'pkg-1',
      p_org_id: 'org-1',
      p_cancelled_by: 'admin-1',
    });
  });

  it('refuses cancellation when Stripe has already completed payment', async () => {
    mocks.retrieve.mockResolvedValue({
      session: { status: 'complete', payment_status: 'paid' },
      stripeAccount: 'acct_org',
    });
    expect(await cancelPackage()).toMatchObject({ statusCode: 409, body: { code: 'paid' } });
    expect(mocks.expire).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('cannot expire or cancel a package owned by another organization', async () => {
    mocks.pkg.pool_organization_id = 'org-2';
    expect(await cancelPackage()).toMatchObject({ statusCode: 403 });
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
