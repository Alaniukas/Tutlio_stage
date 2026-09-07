import { beforeEach, describe, expect, it, vi } from 'vitest';

function mockRes() {
  const result: { statusCode: number; body: any } = { statusCode: 0, body: null };
  return {
    status(code: number) {
      result.statusCode = code;
      return this;
    },
    json(body: any) {
      result.body = body;
      return this;
    },
    getResult: () => result,
  };
}

const { requireOrgAdminAccess } = vi.hoisted(() => ({
  requireOrgAdminAccess: vi.fn(),
}));
const isOrgOwner = (access: { role?: string; status?: string }) => (
  access.role === 'owner' && access.status === 'active'
);
vi.mock('../../api/_lib/orgAdminAccess', () => ({
  requireOrgAdminAccess,
  isOrgOwner,
  getOrgOwnerUserId: vi.fn().mockResolvedValue('owner-1'),
}));
vi.mock('../../api/_lib/orgAdminAccess.js', () => ({
  requireOrgAdminAccess,
  isOrgOwner,
  getOrgOwnerUserId: vi.fn().mockResolvedValue('owner-1'),
}));

const targetMaybeSingle = vi.fn();
const listOrder = vi.fn();
const auditInsert = vi.fn();
const rpc = vi.fn();
const deleteUser = vi.fn();

const from = vi.fn((table: string) => {
  if (table === 'organization_admins') {
    return {
      select: vi.fn((columns: string) => {
        if (columns.includes('organization_id')) {
          return {
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({ maybeSingle: targetMaybeSingle })),
            })),
          };
        }
        return {
          eq: vi.fn(() => ({
            is: vi.fn(() => ({ order: listOrder })),
          })),
        };
      }),
    };
  }
  if (table === 'organization_admin_audit') {
    return { insert: auditInsert };
  }
  if (table === 'profiles') {
    return {
      select: vi.fn(() => ({ in: vi.fn().mockResolvedValue({ data: [], error: null }) })),
    };
  }
  return {};
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from,
    rpc,
    auth: { admin: { deleteUser } },
  })),
}));

const ownerAccess = {
  id: 'owner-seat',
  userId: 'owner-1',
  organizationId: 'org-1',
  role: 'owner',
  status: 'active',
  permissions: {},
  acceptedAt: '2026-08-01T00:00:00.000Z',
};

describe.sequential('POST /api/org-admin-members access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
    requireOrgAdminAccess.mockResolvedValue({ ok: true, access: ownerAccess });
    targetMaybeSingle.mockResolvedValue({ data: null, error: null });
    listOrder.mockResolvedValue({ data: [], error: null });
    auditInsert.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ error: null });
    deleteUser.mockResolvedValue({ error: null });
  });

  it('does not let a non-owner manage organization seats without team.edit', async () => {
    requireOrgAdminAccess.mockResolvedValue({
      ok: true,
      access: { ...ownerAccess, role: 'admin', permissions: {} },
    });
    const handler = (await import('../../api/org-admin-members')).default;
    const res = mockRes();

    await handler({
      method: 'POST',
      headers: {},
      body: { action: 'set_status', memberId: 'seat-2', status: 'suspended' },
    } as any, res as any);

    expect(res.getResult().statusCode).toBe(403);
    expect(targetMaybeSingle).not.toHaveBeenCalled();
  });

  it('lets a team operator list members without the owner seat', async () => {
    listOrder.mockResolvedValue({
      data: [
        { id: 'owner-seat', user_id: 'owner-1', role: 'owner', status: 'active', permissions: {}, accepted_at: '2026-08-01T00:00:00.000Z', created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z' },
        { id: 'operator-seat', user_id: 'operator-1', role: 'custom', status: 'active', permissions: {}, accepted_at: '2026-08-02T00:00:00.000Z', created_at: '2026-08-02T00:00:00.000Z', updated_at: '2026-08-02T00:00:00.000Z' },
      ],
      error: null,
    });
    requireOrgAdminAccess.mockResolvedValue({
      ok: true,
      access: {
        ...ownerAccess,
        id: 'operator-seat',
        userId: 'operator-1',
        role: 'custom',
        permissions: { 'team.view': true, 'team.edit': true },
      },
    });
    const handler = (await import('../../api/org-admin-members')).default;
    const res = mockRes();

    await handler({ method: 'GET', headers: {} } as any, res as any);

    expect(res.getResult()).toMatchObject({
      statusCode: 200,
      body: {
        members: [{ id: 'operator-seat', userId: 'operator-1', role: 'custom' }],
      },
    });
  });

  it('lets an operator-owner list members without the director owner seat', async () => {
    listOrder.mockResolvedValue({
      data: [
        { id: 'owner-seat', user_id: 'owner-1', role: 'owner', status: 'active', permissions: {}, accepted_at: '2026-08-01T00:00:00.000Z', created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z' },
        { id: 'operator-seat', user_id: 'operator-1', role: 'owner', status: 'active', permissions: { 'finance.totals': false }, accepted_at: '2026-08-02T00:00:00.000Z', created_at: '2026-08-02T00:00:00.000Z', updated_at: '2026-08-02T00:00:00.000Z' },
      ],
      error: null,
    });
    requireOrgAdminAccess.mockResolvedValue({
      ok: true,
      access: {
        ...ownerAccess,
        id: 'operator-seat',
        userId: 'operator-1',
        role: 'owner',
        permissions: { 'finance.totals': false },
      },
    });
    const handler = (await import('../../api/org-admin-members')).default;
    const res = mockRes();

    await handler({ method: 'GET', headers: {} } as any, res as any);

    expect(res.getResult()).toMatchObject({
      statusCode: 200,
      body: {
        members: [{ id: 'operator-seat', userId: 'operator-1', role: 'owner' }],
      },
    });
  });

  it('does not transfer ownership to an unaccepted invitation', async () => {
    targetMaybeSingle.mockResolvedValue({
      data: {
        id: 'seat-2',
        user_id: 'admin-2',
        organization_id: 'org-1',
        role: 'admin',
        status: 'active',
        accepted_at: null,
        revoked_at: null,
      },
      error: null,
    });
    const handler = (await import('../../api/org-admin-members')).default;
    const res = mockRes();

    await handler({
      method: 'POST',
      headers: {},
      body: { action: 'transfer_owner', memberId: 'seat-2' },
    } as any, res as any);

    expect(res.getResult().statusCode).toBe(400);
    expect(rpc).not.toHaveBeenCalledWith('transfer_org_admin_ownership', expect.anything());
  });

  it('does not let a team operator transfer ownership', async () => {
    requireOrgAdminAccess.mockResolvedValue({
      ok: true,
      access: {
        ...ownerAccess,
        id: 'operator-seat',
        userId: 'operator-1',
        role: 'custom',
        permissions: { 'team.view': true, 'team.edit': true },
      },
    });
    targetMaybeSingle.mockResolvedValue({
      data: {
        id: 'seat-2',
        user_id: 'admin-2',
        organization_id: 'org-1',
        role: 'admin',
        status: 'active',
        accepted_at: '2026-08-02T00:00:00.000Z',
        revoked_at: null,
      },
      error: null,
    });
    const handler = (await import('../../api/org-admin-members')).default;
    const res = mockRes();

    await handler({
      method: 'POST',
      headers: {},
      body: { action: 'transfer_owner', memberId: 'seat-2' },
    } as any, res as any);

    expect(res.getResult().statusCode).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('revokes database access before best-effort auth deletion', async () => {
    targetMaybeSingle.mockResolvedValue({
      data: {
        id: 'seat-2',
        user_id: 'admin-2',
        organization_id: 'org-1',
        role: 'admin',
        status: 'active',
        accepted_at: '2026-08-02T00:00:00.000Z',
        revoked_at: null,
      },
      error: null,
    });
    const callOrder: string[] = [];
    rpc.mockImplementation(async () => {
      callOrder.push('revoke');
      return { error: null };
    });
    deleteUser.mockImplementation(async () => {
      callOrder.push('delete-auth');
      return { error: new Error('Storage owner') };
    });
    const handler = (await import('../../api/org-admin-members')).default;
    const res = mockRes();

    await handler({
      method: 'POST',
      headers: {},
      body: { action: 'remove', memberId: 'seat-2' },
    } as any, res as any);

    expect(callOrder).toEqual(['revoke', 'delete-auth']);
    expect(rpc).toHaveBeenCalledWith('revoke_org_admin_seat', {
      p_org_id: 'org-1',
      p_owner_user_id: 'owner-1',
      p_target_user_id: 'admin-2',
    });
    expect(res.getResult()).toMatchObject({
      statusCode: 200,
      body: { success: true, authUserDeleted: false },
    });
  });
});
