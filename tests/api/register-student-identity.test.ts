import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), writes: vi.fn(), row: {} as any }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  auth: { admin: { createUser: m.create, updateUserById: m.update } },
  from: () => { const q: any = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: m.row }), update: m.writes }; return q; },
}) }));
import handler from '../../api/register-student';
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co'); vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test'); m.row = { id: 'child', email: 'child@example.test', linked_user_id: null, organization_id: null }; });
describe('registration identity protection', () => {
  it.each(['archived', 'existing'])('rejects %s accounts without reassigning or resetting them', async scenario => {
    if (scenario === 'archived') m.row.detached_at = '2026-09-07';
    m.create.mockResolvedValue({ data: {}, error: { code: 'email_exists' } });
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    await handler({ method: 'POST', headers: { host: 'tutlio.lt' }, body: { studentId: 'child', email: 'child@example.test', password: 'example-password' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(scenario === 'archived' ? 404 : 400);
    if (scenario === 'archived') expect(m.create).not.toHaveBeenCalled();
    expect(m.update).not.toHaveBeenCalled(); expect(m.writes).not.toHaveBeenCalled();
  });
});
