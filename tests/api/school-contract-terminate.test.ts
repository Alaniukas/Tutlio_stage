import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  adminOk: true,
  contract: null as any,
  patch: null as Record<string, unknown> | null,
}));

const groupPolicy = vi.hoisted(() => ({
  preview: vi.fn(),
  suspend: vi.fn(),
}));

vi.mock('../../api/_lib/orgAdminAccess.js', () => ({
  requireOrgAdminAccess: async () => state.adminOk
    ? { ok: true, access: { organizationId: 'school', userId: 'admin' } }
    : { ok: false, status: 403, error: 'Forbidden' },
}));

vi.mock('../../api/_lib/extraLessonsContractShared.js', () => ({
  serviceSupabase: () => ({
    from: () => {
      let write = false;
      const query: any = {
        select: () => query,
        eq: () => query,
        is: () => query,
        update: (patch: Record<string, unknown>) => {
          state.patch = patch;
          write = true;
          return query;
        },
        maybeSingle: async () => write
          ? { data: { id: state.contract?.id, terminated_at: state.patch?.terminated_at }, error: null }
          : { data: state.contract, error: null },
      };
      return query;
    },
  }),
}));

vi.mock('../../api/_lib/schoolGroupMinimumPolicy.js', () => ({
  previewSchoolGroupContractExit: groupPolicy.preview,
  suspendSchoolGroupIfBelowMinimum: groupPolicy.suspend,
}));

import handler from '../../api/school-contract-terminate';

function response() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
}

beforeEach(() => {
  state.adminOk = true;
  state.patch = null;
  state.contract = {
    id: 'contract', organization_id: 'school', kind: 'annual',
    class_group_id: null, terminated_at: null, withdrawal_requested_at: null,
  };
  groupPolicy.preview.mockReset().mockResolvedValue(null);
  groupPolicy.suspend.mockReset().mockResolvedValue({ groupSuspended: false });
});

describe('school contract termination', () => {
  it('records an auditable annual-contract termination', async () => {
    const res = response();
    await handler({ method: 'POST', body: { contractId: 'contract', reason: 'Parent request' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(state.patch).toMatchObject({
      termination_reason: 'Parent request',
      terminated_by: 'admin',
      terminated_at: expect.any(String),
    });
    expect(state.patch).not.toHaveProperty('withdrawal_requested_at');
  });

  it('also closes the legacy extra-lessons billing window', async () => {
    state.contract.kind = 'extra_lessons';
    const res = response();
    await handler({ method: 'POST', body: { contractId: 'contract', reason: 'Services ended' } } as any, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(state.patch).toMatchObject({
      withdrawal_requested_at: expect.any(String),
      withdrawal_reason: 'school_admin_termination',
      extra_end_kind: 'termination',
    });
  });

  it('requires edit access and a recorded reason', async () => {
    state.adminOk = false;
    const forbidden = response();
    await handler({ method: 'POST', body: { contractId: 'contract', reason: 'Reason' } } as any, forbidden);
    expect(forbidden.status).toHaveBeenCalledWith(403);
    state.adminOk = true;
    const invalid = response();
    await handler({ method: 'POST', body: { contractId: 'contract', reason: '' } } as any, invalid);
    expect(invalid.status).toHaveBeenCalledWith(400);
  });

  it('previews a group-breaking termination without changing the contract', async () => {
    state.contract.class_group_id = 'group-1';
    groupPolicy.preview.mockResolvedValue({
      groupId: 'group-1',
      groupName: '7 klasė',
      currentActiveStudentCount: 3,
      remainingActiveStudentCount: 2,
      minimumStudentCount: 3,
      willSuspendGroup: true,
    });
    const res = response();
    await handler({ method: 'POST', body: { contractId: 'contract', preview: true } } as any, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      willSuspendGroup: true,
    }));
    expect(state.patch).toBeNull();
  });

  it('requires explicit confirmation before a termination that suspends the group', async () => {
    state.contract.class_group_id = 'group-1';
    const impact = {
      groupId: 'group-1',
      groupName: '7 klasė',
      currentActiveStudentCount: 3,
      remainingActiveStudentCount: 2,
      minimumStudentCount: 3,
      willSuspendGroup: true,
    };
    groupPolicy.preview.mockResolvedValue(impact);

    const warning = response();
    await handler({ method: 'POST', body: { contractId: 'contract', reason: 'Parent request' } } as any, warning);
    expect(warning.status).toHaveBeenCalledWith(409);
    expect(warning.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'GROUP_WILL_SUSPEND' }));
    expect(state.patch).toBeNull();

    const confirmed = response();
    await handler({
      method: 'POST',
      body: { contractId: 'contract', reason: 'Parent request', confirmGroupSuspension: true },
    } as any, confirmed);
    expect(confirmed.status).toHaveBeenCalledWith(200);
    expect(state.patch).toMatchObject({ termination_reason: 'Parent request' });
    expect(groupPolicy.suspend).toHaveBeenCalledTimes(1);
  });
});
