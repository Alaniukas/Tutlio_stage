import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ auth: vi.fn(), get: vi.fn(), update: vi.fn() }));
vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: m.auth }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ auth: { admin: { getUserById: m.get, updateUserById: m.update } } }) }));
import handler from '../../api/change-temporary-password';
beforeEach(() => { vi.clearAllMocks(); m.auth.mockResolvedValue({ userId: 'own-user' }); m.get.mockResolvedValue({ data: { user: { app_metadata: { temporary_password: true, existing: 'keep' } } } }); m.update.mockResolvedValue({ error: null }); });
const request = (password = 'new-private-password') => ({ method: 'POST', body: { password, userId: 'attacker-target' }, headers: {} } as any);
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any);
describe('temporary password change', () => {
  it('changes only the authenticated user and preserves unrelated app metadata', async () => {
    const res = response(); await handler(request(), res);
    expect(m.update).toHaveBeenCalledWith('own-user', { password: 'new-private-password', app_metadata: { temporary_password: false, existing: 'keep' } });
  });
  it('rejects unauthenticated requests', async () => {
    m.auth.mockResolvedValue(null); const res = response(); await handler(request(), res);
    expect(res.status).toHaveBeenCalledWith(401); expect(m.update).not.toHaveBeenCalled();
  });
  it('does not expose an admin reset flow for ordinary accounts', async () => {
    m.get.mockResolvedValue({ data: { user: { app_metadata: {} } } }); const res = response(); await handler(request(), res);
    expect(res.status).toHaveBeenCalledWith(403); expect(m.update).not.toHaveBeenCalled();
  });
});
