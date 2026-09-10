import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ auth: vi.fn(), access: vi.fn(), preview: vi.fn(), deliver: vi.fn(), renewal: vi.fn(),
  rpc: vi.fn(), from: vi.fn(), isPro: vi.fn() }));
vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: mocks.auth }));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({ getOrgAdminAccessByUserId: mocks.access }));
vi.mock('../../api/_lib/marketMoney.js', () => ({ isProKlaseOrg: mocks.isPro }));
vi.mock('../../api/_lib/public-origin.js', () => ({ publicOriginFromRequest: () => 'https://tutlio.lt' }));
vi.mock('../../api/_lib/monthlyStudentPackage.js', () => ({ previewMonthlyStudentPackage: mocks.preview }));
vi.mock('../../api/_lib/pooledMonthlyGeneration.js', () => ({
  deliverPooledPackageOffer: mocks.deliver,
  ensurePooledMonthlyRenewal: mocks.renewal,
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
import handler from '../../api/create-monthly-student-package';

function response() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}
async function call(body: Record<string, unknown>) {
  const res = response();
  await handler({ method: 'POST', body, headers: { origin: 'https://attacker.invalid' } } as any, res as any);
  return res;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SUPABASE_URL', 'https://db.invalid'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-only');
  vi.stubEnv('APP_URL', 'https://tutlio.lt'); vi.stubEnv('VERCEL_URL', '');
  mocks.auth.mockResolvedValue({ userId: 'admin' });
  mocks.access.mockResolvedValue({ organizationId: 'org', role: 'owner', permissions: {} });
  mocks.isPro.mockReturnValue(true);
  mocks.preview.mockResolvedValue({ items: [{ subjectId: 'lt', totalLessons: 4 }, { subjectId: 'math', totalLessons: 5 }],
    totalLessons: 9, pricePerLesson: 27, totalPrice: 243, studentIds: ['student','sibling-row'], sessionIds: ['session'],
    periodStart: '2026-09-01', periodEnd: '2026-09-30', previewToken: 'snapshot' });
  mocks.rpc.mockResolvedValue({ data: 'package', error: null });
  mocks.deliver.mockResolvedValue({ status: 'sent' });
  mocks.renewal.mockResolvedValue(undefined);
  mocks.from.mockImplementation((table: string) => {
    const result = table === 'students' ? { data: { id: 'student', tutor_id: 'tutor' }, error: null }
      : table === 'organizations' ? { data: { features: { monthly_packages: true }, stripe_account_id: 'acct', stripe_onboarding_complete: true }, error: null }
        : { data: [], error: null };
    const chain: any = { then: (resolve: any) => Promise.resolve(result).then(resolve) };
    for (const method of ['select','eq','is','single','update']) chain[method] = vi.fn(() => chain);
    return chain;
  });
});
describe('consolidated monthly endpoint', () => {
  it('allows another send attempt after a reported email failure', async () => {
    mocks.deliver.mockResolvedValueOnce({ status: 'failed', error: 'Delivery failed' });
    const body = { studentId: 'student', preview: false, previewToken: 'snapshot' };
    expect((await call(body)).json).toHaveBeenCalledWith(expect.objectContaining({ success: true, emailSent: false, emailError: 'Delivery failed' }));
    expect(mocks.renewal).not.toHaveBeenCalled();
    expect((await call(body)).json).toHaveBeenCalledWith(expect.objectContaining({ success: true, emailSent: true }));
    expect(mocks.deliver).toHaveBeenCalledTimes(2);
    expect(mocks.renewal).toHaveBeenCalledTimes(1);
  });
  it('requires a real user and finance edit access before reading student data', async () => {
    mocks.auth.mockResolvedValue({ isInternal: true });
    expect((await call({ studentId: 'student', preview: true })).status).toHaveBeenCalledWith(401);
    expect(mocks.from).not.toHaveBeenCalled();
    mocks.auth.mockResolvedValue({ userId: 'admin' }); mocks.access.mockResolvedValue(null);
    expect((await call({ studentId: 'student', preview: true })).status).toHaveBeenCalledWith(403);
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it('preview performs no package mutation or email send', async () => {
    const res = await call({ studentId: 'student', preview: true });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.deliver).not.toHaveBeenCalled();
    expect(mocks.preview.mock.calls[0][3]).toMatch(/^\d{4}-\d{2}-01$/);
  });
  it('rejects stale snapshots before any mutation', async () => {
    expect((await call({ studentId: 'student', preview: false, previewToken: 'old' })).status).toHaveBeenCalledWith(409);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('uses the authoritative common rate and trusted server URL for delivery', async () => {
    const body = { studentId: 'student', preview: false, previewToken: 'snapshot', pricePerLesson: 1, totalLessons: 999 };
    await call(body);
    expect(mocks.rpc).toHaveBeenCalledWith('create_org_student_package', expect.objectContaining({ p_unit_price: 27, p_student_ids: ['student','sibling-row'] }));
    expect(mocks.deliver).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      appOrigin: 'https://tutlio.lt', sendEmailOrigin: 'https://tutlio.lt', packageId: 'package',
    }));
  });
  it('rejects in-place package conversion and disabled organizations', async () => {
    expect((await call({ studentId: 'student', preview: false, packageId: 'legacy' })).status).toHaveBeenCalledWith(400);
    mocks.isPro.mockReturnValue(false);
    expect((await call({ studentId: 'student', preview: true })).status).toHaveBeenCalledWith(403);
    expect(mocks.preview).not.toHaveBeenCalled();
  });
});
