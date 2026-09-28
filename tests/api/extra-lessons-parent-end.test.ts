// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { groupSeed, schoolGroupDatabase } from '../fixtures/schoolGroupDatabase';
const mocks = vi.hoisted(() => ({ db: null as any, auth: vi.fn(), end: vi.fn(), group: vi.fn() }));
vi.mock('../../api/_lib/auth.js', () => ({ verifyRequestAuth: mocks.auth }));
vi.mock('../../api/_lib/extraLessonsContractShared.js', () => ({
  serviceSupabase: () => mocks.db, internalApiOrigin: () => 'https://test.invalid',
  endExtraLessonsContract: mocks.end, loadExtraLessonsContractByToken: vi.fn(),
}));
vi.mock('../../api/_lib/schoolGroupMinimumPolicy.js', () => ({ suspendSchoolGroupIfBelowMinimum: mocks.group }));
import handler from '../../api/extra-lessons-contract-withdraw';

const request = async () => {
  const result = { status: 0, body: null as any };
  const res = { status(n: number) { result.status = n; return this; }, json(body: any) { result.body = body; return this; } };
  await handler({ method: 'POST', body: { contract_id: 'c1', intended_kind: 'termination' } } as any, res as any);
  return result;
};
beforeEach(() => {
  mocks.auth.mockReset().mockResolvedValue({ userId: 'parent' });
  mocks.end.mockReset().mockResolvedValue({ ok: true, kind: 'termination', statementPath: 'statement.pdf' });
  mocks.group.mockReset().mockResolvedValue({ groupSuspended: false });
});

describe('parent initiated extra contract ending', () => {
  it('authorizes an existing parent_students-only relationship and reconciles that contract group', async () => {
    const seed = groupSeed();
    seed.parent_profiles = [{ id: 'profile', user_id: 'parent' }];
    seed.parent_students = [{ parent_id: 'profile', student_id: 's1' }];
    const db = schoolGroupDatabase(seed);
    mocks.db = db.client;
    expect((await request()).status).toBe(200);
    expect(mocks.end).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: 'parent' }));
    expect(mocks.group).toHaveBeenCalledWith(expect.anything(), db.client, expect.objectContaining({ organizationId: 'school', groupId: 'group', triggerContractId: 'c1' }));
  });

  it('forbids an unrelated parent and excludes annual contracts from this endpoint', async () => {
    const seed = groupSeed();
    seed.parent_profiles = [{ id: 'profile', user_id: 'parent' }];
    seed.parent_students = [{ parent_id: 'profile', student_id: 's2' }];
    const db = schoolGroupDatabase(seed);
    mocks.db = db.client;
    expect((await request()).status).toBe(403);
    db.tables.school_contracts[0].kind = 'annual';
    expect((await request()).status).toBe(400);
    expect(mocks.end).not.toHaveBeenCalled();
    expect(mocks.group).not.toHaveBeenCalled();
  });

  it('heals group membership on a retried end without resending the confirmation', async () => {
    const seed = groupSeed();
    seed.students[0].parent_user_id = 'parent';
    seed.school_contracts[0].withdrawal_requested_at = '2026-09-28';
    seed.school_contracts[0].extra_end_kind = 'termination';
    mocks.db = schoolGroupDatabase(seed).client;
    expect((await request()).status).toBe(200);
    expect(mocks.end).not.toHaveBeenCalled();
    expect(mocks.group).toHaveBeenCalledOnce();
  });
});
