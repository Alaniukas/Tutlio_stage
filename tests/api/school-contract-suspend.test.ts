import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  contract: null as any,
  patch: null as Record<string, unknown> | null,
}));

const groupPolicy = vi.hoisted(() => ({
  suspend: vi.fn(),
  resume: vi.fn(),
}));

vi.mock('../../api/_lib/orgAdminAccess.js', () => ({
  requireOrgAdminAccess: async () => ({
    ok: true,
    access: { organizationId: 'school', userId: 'admin' },
  }),
}));

vi.mock('../../api/_lib/extraLessonsContractShared.js', () => ({
  serviceSupabase: () => ({
    from: () => {
      let write = false;
      const query: any = {
        select: () => query,
        eq: () => query,
        update: (patch: Record<string, unknown>) => {
          state.patch = patch;
          write = true;
          return query;
        },
        maybeSingle: async () => ({ data: state.contract, error: null }),
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve(write ? { data: null, error: null } : { data: state.contract, error: null })
            .then(resolve, reject);
        },
      };
      return query;
    },
  }),
}));

vi.mock('../../api/_lib/schoolGroupMinimumPolicy.js', () => ({
  suspendSchoolGroupIfBelowMinimum: groupPolicy.suspend,
  resumeSchoolGroupIfMinimumMet: groupPolicy.resume,
}));

import handler from '../../api/school-contract-suspend';

function response() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
}

beforeEach(() => {
  state.patch = null;
  state.contract = {
    id: 'contract-1',
    organization_id: 'school',
    class_group_id: 'group-1',
    terminated_at: null,
    withdrawal_requested_at: null,
    suspension_started_at: null,
    suspension_resumed_at: null,
    suspension_scope: null,
  };
  groupPolicy.suspend.mockReset().mockResolvedValue({
    groupSuspended: true,
    groupJustSuspended: true,
    groupName: '7 klasė',
    activeStudentCount: 2,
  });
  groupPolicy.resume.mockReset().mockResolvedValue({
    groupWasSuspended: false,
    resumed: false,
    resumableStudentCount: 0,
  });
});

describe('school contract suspension', () => {
  it('marks the selected contract as individual and evaluates its group immediately', async () => {
    const res = response();
    await handler({
      method: 'POST',
      body: { contractId: 'contract-1', action: 'suspend', reason: 'Laikinai nelanko' },
    } as any, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(state.patch).toMatchObject({
      suspension_scope: 'individual',
      suspension_group_id: 'group-1',
      suspension_reason: 'Laikinai nelanko',
    });
    expect(groupPolicy.suspend).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({
      groupId: 'group-1',
      triggerContractId: 'contract-1',
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ groupSuspended: true }));
  });

  it('does not resume a suspended group until at least three students can be active', async () => {
    state.contract.suspension_started_at = '2026-09-18T08:00:00.000Z';
    state.contract.suspension_scope = 'group_under_minimum';
    groupPolicy.resume.mockResolvedValue({
      groupWasSuspended: true,
      resumed: false,
      resumableStudentCount: 2,
      groupName: '7 klasė',
    });
    const res = response();
    await handler({
      method: 'POST',
      body: { contractId: 'contract-1', action: 'resume' },
    } as any, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'GROUP_MINIMUM_NOT_MET',
      activeStudentCount: 2,
    }));
    expect(state.patch).toBeNull();
  });

  it('resumes all group-paused contracts together after the minimum is restored', async () => {
    state.contract.suspension_started_at = '2026-09-18T08:00:00.000Z';
    state.contract.suspension_scope = 'group_under_minimum';
    groupPolicy.resume.mockResolvedValue({
      groupWasSuspended: true,
      resumed: true,
      resumableStudentCount: 3,
      groupName: '7 klasė',
    });
    const res = response();
    await handler({
      method: 'POST',
      body: { contractId: 'contract-1', action: 'resume' },
    } as any, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      groupResumed: true,
      groupName: '7 klasė',
    }));
    expect(state.patch).toBeNull();
  });
});
