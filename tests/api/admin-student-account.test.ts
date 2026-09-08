import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ access: vi.fn(), from: vi.fn(), create: vi.fn(), remove: vi.fn(), update: vi.fn(), writes: [] as any[], filters: [] as any[], student: null as any, failTable: '', emptyLinkReturn: false, verifiedLink: '' }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: m.from, auth: { admin: { createUser: m.create, deleteUser: m.remove, updateUserById: m.update } } }) }));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({ requireOrgAdminAccess: m.access }));
import handler from '../../api/admin-student-account';
function res() { const r: any = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() }; return r; }
function req(role = 'student') { return { method: 'POST', headers: {}, body: { student_id: 's1', role }, query: {} } as any; }
beforeEach(() => {
  vi.clearAllMocks(); m.filters = []; m.writes = []; m.failTable = ''; m.emptyLinkReturn = false; m.verifiedLink = '';
  m.student = { id: 's1', full_name: 'Child', email: 'child@example.test', payer_name: 'Parent', payer_email: 'parent@example.test', linked_user_id: null };
  m.access.mockResolvedValue({ ok: true, access: { organizationId: 'org1' } });
  m.create.mockResolvedValue({ data: { user: { id: 'new-user' } }, error: null });
  m.from.mockImplementation((table: string) => {
    let selection = '';
    const b: any = { select: (columns: string) => { selection = columns; return b; }, eq: (k: string, v: any) => { m.filters.push([table, k, v]); return b; }, is: () => b, update: () => b, upsert: (data: any) => { m.writes.push([table, data]); return b; },
      maybeSingle: async () => ({ data: selection === 'linked_user_id' ? { linked_user_id: m.verifiedLink } : m.student, error: null }), single: async () => ({ data: { id: 'parent-profile' }, error: null }),
      then: (resolve: any) => Promise.resolve({ data: table === 'students' && !m.emptyLinkReturn ? [{ id: 's1' }] : [], error: table === m.failTable ? { message: 'injected write failure' } : null }).then(resolve) };
    return b;
  });
});
describe('admin account provisioning', () => {
  it('verifies an empty update representation against the exact new account', async () => {
    m.emptyLinkReturn = true; m.verifiedLink = 'new-user';
    const r = res(); await handler(req(), r);
    expect(r.status).toHaveBeenCalledWith(200); expect(m.remove).not.toHaveBeenCalled();
  });
  it('does not accept an empty update result linked to a different account', async () => {
    m.emptyLinkReturn = true; m.verifiedLink = 'other-user';
    const r = res(); await handler(req(), r);
    expect(r.status).toHaveBeenCalledWith(500); expect(m.remove).toHaveBeenCalledWith('new-user');
  });
  it('requires edit permission and creates a linked student with a server-controlled temporary flag', async () => {
    const r = res(); await handler(req(), r);
    expect(m.access).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'students.edit');
    expect(m.filters).toContainEqual(['students', 'organization_id', 'org1']);
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ email: 'child@example.test', app_metadata: { temporary_password: true, provisioned_by_organization: 'org1' } }));
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ temporaryPassword: expect.any(String), role: 'student' }));
    expect(m.update).not.toHaveBeenCalled();
    expect(m.writes).toContainEqual(['profiles', expect.objectContaining({ organization_id: null })]);
  });
  it('creates the parent without inventing a child login', async () => {
    const r = res(); await handler(req('parent'), r);
    expect(m.create).toHaveBeenCalledTimes(1);
    expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ email: 'parent@example.test' }));
    expect(m.from).toHaveBeenCalledWith('parent_profiles');
  });
  it('rolls back only the newly created account if its profile cannot be saved', async () => {
    m.failTable = 'profiles'; const r = res(); await handler(req(), r);
    expect(r.status).toHaveBeenCalledWith(500);
    expect(m.remove).toHaveBeenCalledWith('new-user');
    expect(m.update).not.toHaveBeenCalled();
    expect(r.json.mock.calls[0][0]).not.toHaveProperty('temporaryPassword');
  });
  it('refuses a foreign or nonexistent student before creating auth users', async () => {
    m.student = null; const r = res(); await handler(req(), r);
    expect(r.status).toHaveBeenCalledWith(404); expect(m.create).not.toHaveBeenCalled();
  });
  it('never resets an existing account password', async () => {
    m.create.mockResolvedValue({ data: {}, error: { code: 'email_exists' } });
    const r = res(); await handler(req(), r);
    expect(r.status).toHaveBeenCalledWith(409); expect(m.update).not.toHaveBeenCalled(); expect(m.remove).not.toHaveBeenCalled();
  });
  it('rejects unauthorized access without querying contacts', async () => {
    m.access.mockResolvedValue({ ok: false, status: 403, error: 'Forbidden' });
    const r = res(); await handler(req(), r);
    expect(r.status).toHaveBeenCalledWith(403); expect(m.from).not.toHaveBeenCalled();
  });
});
