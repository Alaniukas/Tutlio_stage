// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PRO_KLASE_ORG_ID } from '../../src/lib/marketMoney';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), seat: vi.fn(), from: vi.fn(), rpc: vi.fn() }));
vi.mock('../../api/_lib/auth', () => ({ verifyRequestAuth: mocks.auth }));
vi.mock('../../api/_lib/orgAdminAccess', () => ({ getOrgAdminSeatByUserId: mocks.seat }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
import handler from '../../api/student-registration-status';

const request = (query = {}) => ({ method: 'GET', headers: {}, query }) as any;
const response = () => {
  const res: any = { setHeader: vi.fn(), status: vi.fn((code) => { res.code = code; return res; }), json: vi.fn((body) => { res.body = body; return res; }) };
  return res;
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test');
  mocks.auth.mockResolvedValue({ userId: 'admin', isInternal: false });
  mocks.seat.mockResolvedValue({ organizationId: PRO_KLASE_ORG_ID, role: 'owner', status: 'active', permissions: {} });
  mocks.from.mockImplementation((table) => {
    const builder: any = { select: () => builder, eq: () => builder, maybeSingle: async () => ({
      data: table === 'organizations' ? { features: {} } : { organization_id: PRO_KLASE_ORG_ID }, error: null,
    }) };
    return builder;
  });
  mocks.rpc.mockReturnValue({ range: async () => ({ data: [{ student_id: 's1', registration_pending: true }], error: null }) });
});

describe('registration status authorization', () => {
  it('uses the authenticated admin organization and ignores supplied organization/tutor IDs', async () => {
    const res = response();
    await handler(request({ organizationId: 'foreign', tutorId: 'foreign-tutor' }), res);
    expect(res.code).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('org_student_registration_states', { p_organization_id: PRO_KLASE_ORG_ID, p_tutor_id: null });
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });
  it('limits tutors to their own student assignments', async () => {
    mocks.auth.mockResolvedValue({ userId: 'tutor', isInternal: false }); mocks.seat.mockResolvedValue(null);
    const res = response(); await handler(request({ tutorId: 'someone-else' }), res);
    expect(res.code).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('org_student_registration_states', { p_organization_id: PRO_KLASE_ORG_ID, p_tutor_id: 'tutor' });
  });
  it('rejects anonymous, internal, revoked and restricted admins before reading auth states', async () => {
    for (const auth of [null, { userId: 'internal', isInternal: true }]) {
      mocks.auth.mockResolvedValue(auth); const res = response(); await handler(request(), res); expect(res.code).toBe(401);
    }
    mocks.auth.mockResolvedValue({ userId: 'admin', isInternal: false });
    for (const seat of [
      { organizationId: PRO_KLASE_ORG_ID, role: 'owner', status: 'revoked', permissions: {} },
      { organizationId: PRO_KLASE_ORG_ID, role: 'custom', status: 'active', permissions: { 'students.view': false, 'finance.view': true } },
    ]) {
      mocks.seat.mockResolvedValue(seat); const res = response(); await handler(request(), res); expect(res.code).toBe(403);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('supports disabling the feature without calling the new database function', async () => {
    mocks.from.mockImplementation(() => {
      const b: any = { select: () => b, eq: () => b, maybeSingle: async () => ({ data: { features: { pending_registration_lessons: false } }, error: null }) }; return b;
    });
    const res = response(); await handler(request(), res);
    expect(res.body).toEqual({ enabled: false, states: [] }); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('reports a database lookup failure rather than incorrectly confirming accounts', async () => {
    mocks.rpc.mockReturnValue({ range: async () => ({ data: null, error: { message: 'RPC unavailable' } }) });
    const res = response(); await handler(request(), res); expect(res.code).toBe(503);
  });
});
