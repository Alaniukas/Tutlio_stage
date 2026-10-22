// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PRO_KLASE_ORG_ID } from '../../src/lib/marketMoney';
import { verifyMvAccountActivationToken } from '../../api/_lib/mvAccountActivationToken';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), seat: vi.fn(), send: vi.fn(), getUser: vi.fn(), from: vi.fn() }));
vi.mock('../../api/_lib/auth', () => ({ verifyRequestAuth: mocks.auth }));
vi.mock('../../api/_lib/orgAdminAccess', () => ({ getOrgAdminSeatByUserId: mocks.seat }));
vi.mock('../../api/_lib/orgEmailReplyTo', () => ({ resolveOrgEmailReplyToWithServiceClient: async () => 'help@example.test' }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: mocks.from, auth: { admin: { getUserById: mocks.getUser } } }) }));
vi.mock('resend', () => ({ Resend: class { emails = { send: mocks.send }; } }));
import handler from '../../api/student-registration-invitation';

const studentId = '00000000-0000-4000-8000-000000000010';
let student: Record<string, any>;
let user: Record<string, any>;
let orgFeatures: Record<string, unknown>;
const request = (method = 'GET', extra = {}) => ({ method, headers: { host: 'tutlio.lt' }, query: { studentId }, body: { studentId }, ...extra }) as any;
function response() {
  const res: any = { setHeader: vi.fn(), status: vi.fn((code) => { res.code = code; return res; }), json: vi.fn((body) => { res.body = body; return res; }) };
  return res;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service');
  vi.stubEnv('JOIN_LINK_SECRET', 'test-secret');
  vi.stubEnv('RESEND_API_KEY', 'test-resend');
  vi.stubEnv('TUTLIO_DEV_API_LOCAL', '');
  vi.stubEnv('TUTLIO_DEV_SUPPRESS_EMAIL', '');
  mocks.auth.mockResolvedValue({ userId: 'admin', isInternal: false });
  mocks.seat.mockResolvedValue({ organizationId: PRO_KLASE_ORG_ID, role: 'owner', status: 'active', permissions: {} });
  student = { id: studentId, organization_id: PRO_KLASE_ORG_ID, full_name: 'Child', email: 'child@example.test',
    payer_email: null, invite_code: 'ABC123', linked_user_id: 'child-auth', parent_user_id: null, detached_at: null };
  user = { id: 'child-auth', email: student.email, app_metadata: { provisioned_by_organization: PRO_KLASE_ORG_ID }, user_metadata: {},
    email_confirmed_at: '2026-10-14T12:00:00Z', last_sign_in_at: null };
  orgFeatures = {};
  mocks.getUser.mockImplementation(async () => ({ data: { user }, error: null }));
  mocks.send.mockResolvedValue({ data: { id: 'mail-1' }, error: null });
  mocks.from.mockImplementation((table: string) => {
    const filters: Array<(row: any) => boolean> = [];
    const b: any = {
      select: () => b,
      eq: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return b; },
      is: (key: string, value: unknown) => { filters.push((row) => row[key] === value); return b; },
      maybeSingle: async () => ({ data: [table === 'students' ? student : {
        id: PRO_KLASE_ORG_ID, name: 'QA Academy', preferred_locale: 'lt', features: orgFeatures,
      }].find((row) => filters.every((f) => f(row))) || null, error: null }),
    };
    return b;
  });
});

describe('organization registration invitation', () => {
  afterEach(() => vi.restoreAllMocks());
  it('returns an activation link for a pre-created, confirmed but inactive account without sending a message', async () => {
    const res = response(); await handler(request(), res);
    expect(res.code).toBe(200);
    expect(res.body.to).toBe('child@example.test');
    const token = verifyMvAccountActivationToken(new URL(res.body.url).searchParams.get('t')!);
    expect(token.ok && token.payload).toMatchObject({ studentId, role: 'student', email: 'child@example.test' });
    expect(mocks.send).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store');
  });
  it('resends activation to the server-verified account and deduplicates repeated clicks', async () => {
    const now = Date.parse('2026-10-14T12:00:00Z');
    const clock = vi.spyOn(Date, 'now');
    for (let i = 0; i < 2; i++) {
      clock.mockReturnValue(now + i * 10_000);
      const res = response(); await handler(request('POST', { body: { studentId, to: 'attacker@example.test' } }), res); expect(res.code).toBe(200);
    }
    expect(mocks.send.mock.calls[0][0].to).toEqual(['child@example.test']);
    expect(mocks.send.mock.calls[0][1]).toEqual(mocks.send.mock.calls[1][1]);
    expect(mocks.send.mock.calls[0][0]).toEqual(mocks.send.mock.calls[1][0]);
    expect(mocks.send.mock.calls[0][0].html).toContain('/account-activate?t=');
  });
  it('skips activated accounts and keeps the ordinary booking invitation for unlinked accounts', async () => {
    user.last_sign_in_at = '2026-10-14T12:01:00Z';
    const active = response(); await handler(request('POST'), active);
    expect(active.body.skipped).toBe(true); expect(mocks.send).not.toHaveBeenCalled();
    student.linked_user_id = null;
    const unlinked = response(); await handler(request(), unlinked);
    expect(unlinked.body.url).toContain('/book/ABC123');
  });
  it('refuses foreign, archived and unauthorized requests before exposing an activation link', async () => {
    student.organization_id = 'other'; const foreign = response(); await handler(request(), foreign); expect(foreign.code).toBe(404);
    student.organization_id = PRO_KLASE_ORG_ID; student.detached_at = '2026-10-14';
    const archived = response(); await handler(request(), archived); expect(archived.code).toBe(404);
    mocks.seat.mockResolvedValue({ organizationId: PRO_KLASE_ORG_ID, role: 'custom', status: 'active', permissions: { 'students.edit': false } });
    const denied = response(); await handler(request(), denied); expect(denied.code).toBe(403);
    mocks.auth.mockResolvedValue({ userId: 'internal', isInternal: true });
    const internal = response(); await handler(request(), internal); expect(internal.code).toBe(401);
    expect(mocks.getUser).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it('requires a confirmed provider result and suppresses mail in local visual QA', async () => {
    mocks.send.mockResolvedValue({ data: null, error: null });
    const failed = response(); await handler(request('POST'), failed); expect(failed.code).toBe(502);
    vi.stubEnv('TUTLIO_DEV_API_LOCAL', '1'); vi.stubEnv('TUTLIO_DEV_SUPPRESS_EMAIL', '1');
    const suppressed = response(); await handler(request('POST'), suppressed);
    expect(suppressed.body.suppressed).toBe(true); expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it('does not report a missing contact as an already registered account', async () => {
    student.linked_user_id = null; student.email = null;
    const res = response(); await handler(request(), res);
    expect(res.code).toBe(422); expect(res.body.code).toBe('recipient_unavailable'); expect(res.body.skipped).toBeUndefined();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it('keeps schools on their verified family invitation workflow', async () => {
    orgFeatures.school_family_accounts_setup = true;
    const res = response(); await handler(request(), res);
    expect(res.code).toBe(403); expect(mocks.getUser).not.toHaveBeenCalled();
  });
});
