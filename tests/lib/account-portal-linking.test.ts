import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), update: vi.fn(), admin: vi.fn(), student: vi.fn(), parent: false, matches: [] as any[], error: null as any }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: m.rpc, from: m.from } }));
vi.mock('@/lib/preload', () => ({ orgAdminRowByUserDeduped: m.admin, rpcGetStudentByUserIdDeduped: m.student }));
import { resolveAccountPortals } from '@/lib/account-portal';
beforeEach(() => {
  vi.clearAllMocks(); m.parent = false; m.matches = []; m.error = null;
  m.admin.mockResolvedValue(null); m.student.mockResolvedValue({ data: [] });
  m.rpc.mockImplementation(async name => ({ data: name === 'get_parent_profile_id_by_user_id' ? m.parent ? 'parent-id' : null : m.matches }));
  m.from.mockImplementation(table => {
    const q: any = { select: () => q, eq: () => q, is: () => q, update: (value: unknown) => { m.update(value); return q; }, maybeSingle: async () => ({ data: null }), then: (resolve: any) => Promise.resolve({ data: [{ id: 'child' }], error: m.error }).then(resolve) }; return q;
  });
});
describe('safe email fallback during login', () => {
  it('never links a parent to a child using the shared contact email', async () => {
    m.parent = true; m.matches = [{ id: 'placeholder', linked_user_id: null }];
    const portals = await resolveAccountPortals('user', { email: 'family@example.test', linkStudentByEmail: true });
    expect(portals.parent).toBe(true); expect(portals.student).toBe(false); expect(m.update).not.toHaveBeenCalled();
    expect(m.rpc).not.toHaveBeenCalledWith('get_student_by_email_for_linking', expect.anything());
  });
  it.each(['ambiguous', 'foreign', 'failed'])('does not grant a student portal for %s linking', async scenario => {
    m.matches = scenario === 'ambiguous' ? [{ id: 'child' }, { id: 'placeholder' }] : [{ id: 'child', linked_user_id: scenario === 'foreign' ? 'other-user' : null }];
    if (scenario === 'failed') m.error = { message: 'denied' };
    expect((await resolveAccountPortals('user', { email: 'child@example.test', linkStudentByEmail: true })).student).toBe(false);
  });
});
