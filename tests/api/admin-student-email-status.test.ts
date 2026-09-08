import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ access: vi.fn(), from: vi.fn(), check: vi.fn(), filters: [] as unknown[][], student: null as any }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: m.from }) }));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({ requireOrgAdminAccess: m.access }));
vi.mock('../../api/_lib/resendConfig.js', () => ({ getResendApiKey: () => 'test-key' }));
vi.mock('../../api/_lib/recipientSuppression.js', () => ({ checkRecipientSuppression: m.check }));
import handler from '../../api/admin-student-email-status';
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() } as any);
beforeEach(() => {
  vi.clearAllMocks(); m.filters = [];
  m.student = { email: ' Child@example.test ', payer_email: 'child@example.test' };
  m.access.mockResolvedValue({ ok: true, access: { organizationId: 'org1' } });
  m.check.mockImplementation(async (email: string) => ({ email, status: 'blocked' }));
  const query: any = { select: () => query, eq: (k: string, v: unknown) => { m.filters.push([k, v]); return query; }, maybeSingle: async () => ({ data: m.student, error: null }) };
  m.from.mockReturnValue(query);
});
afterEach(() => vi.useRealTimers());
describe('student email diagnostics authorization', () => {
  it('checks only saved contacts in the authorized organization and deduplicates addresses', async () => {
    const res = response();
    await handler({ method: 'GET', query: { student_id: 's1', email: 'foreign@example.test' } } as any, res);
    expect(m.access).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'students.view');
    expect(m.filters).toContainEqual(['organization_id', 'org1']);
    expect(m.check).toHaveBeenCalledExactlyOnceWith('child@example.test', 'test-key');
    expect(res.status).toHaveBeenCalledWith(200);
  });
  it('does not contact Resend or read students when access is denied', async () => {
    m.access.mockResolvedValue({ status: 403, error: 'Forbidden' });
    const res = response(); await handler({ method: 'GET', query: {} } as any, res);
    expect(res.status).toHaveBeenCalledWith(403); expect(m.from).not.toHaveBeenCalled(); expect(m.check).not.toHaveBeenCalled();
  });
  it('does not expose contacts for a foreign student', async () => {
    m.student = null;
    const res = response(); await handler({ method: 'GET', query: { student_id: 'foreign' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(404); expect(m.check).not.toHaveBeenCalled();
  });
  it('includes the secondary parent responsible for the reported incident', async () => {
    vi.useFakeTimers(); m.student = { payer_email: 'one@example.test', parent_secondary_email: 'two@example.test' };
    const promise = handler({ method: 'GET', query: { student_id: 's1' } } as any, response());
    await vi.runAllTimersAsync(); await promise;
    expect(m.check).toHaveBeenCalledWith('two@example.test', 'test-key');
  });
  it('rejects writes', async () => {
    const res = response(); await handler({ method: 'POST' } as any, res);
    expect(res.status).toHaveBeenCalledWith(405); expect(m.check).not.toHaveBeenCalled();
  });
});
