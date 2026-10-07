// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const materialize = vi.hoisted(() => vi.fn());
vi.mock('../../api/_lib/schoolClassGroupMaterialize.js', () => ({ materializeClassGroupNow: materialize }));
import { attachSchoolGroupMinimumStatus, previewSchoolGroupContractExit, reconcileSchoolGroupMinimum, resumeSchoolGroupIfMinimumMet, suspendSchoolGroupIfBelowMinimum } from '../../api/_lib/schoolGroupMinimumPolicy';
import { groupSeed, schoolGroupDatabase } from '../fixtures/schoolGroupDatabase';

const exit = (db: ReturnType<typeof schoolGroupDatabase>) => suspendSchoolGroupIfBelowMinimum({ headers: { host: 'test.invalid' } } as any, db.client, {
  organizationId: 'school', groupId: 'group', triggerContractId: 'c1', adminUserId: 'admin',
});

beforeEach(() => { materialize.mockReset().mockResolvedValue(null); });

describe('per-group minimum policy', () => {
  it('keeps a three-member roster paused until its second contract is confirmed when the minimum is two', async () => {
    const seed = groupSeed(2);
    seed.school_contracts.slice(1).forEach(contract => {
      contract.signing_status = 'sent';
      contract.accepted_at = null;
    });
    const db = schoolGroupDatabase(seed);
    const reconcile = () => reconcileSchoolGroupMinimum({ headers: {} } as any, db.client, {
      organizationId: 'school', groupId: 'group', actorUserId: 'admin',
    });
    const status = () => attachSchoolGroupMinimumStatus(db.client, 'school', [{
      ...db.tables.school_class_groups[0], id: 'group', members: db.tables.school_class_group_members as Array<{ student_id: string }>,
    }]);

    await reconcile();
    expect(db.tables.school_class_groups[0].suspension_started_at).toEqual(expect.any(String));
    const requestCount = db.requests.length;
    expect((await status())[0].minimum_status).toEqual({ eligible_student_count: 1, unconfirmed_student_ids: ['s2', 's3'] });
    expect(db.requests.slice(requestCount).every(request => request.method === 'GET')).toBe(true);
    await reconcile();
    expect(db.tables.school_class_groups[0].suspension_resumed_at).toBeFalsy();

    Object.assign(db.tables.school_contracts[1], { signing_status: 'signed', accepted_at: '2026-09-01T09:00:00.000Z' });
    await reconcile();
    expect(db.tables.school_class_groups[0].suspension_resumed_at).toEqual(expect.any(String));
    expect(db.tables.school_contracts[0].suspension_resumed_at).toEqual(expect.any(String));
    expect((await status())[0].minimum_status).toEqual({ eligible_student_count: 2, unconfirmed_student_ids: ['s3'] });
  });

  it('uses the live eligibility rules for staff counts and ignores other groups and organizations', async () => {
    const seed = groupSeed();
    seed.school_contracts[0].suspension_started_at = '2026-09-01';
    seed.school_contracts[0].suspension_scope = 'group_under_minimum';
    seed.school_contracts[1].suspension_started_at = '2026-09-01';
    seed.school_contracts[1].suspension_scope = 'individual';
    seed.school_contracts[2].order_snapshot = { end_date: '2020-01-01' };
    seed.school_contracts.push(
      { ...seed.school_contracts[0], id: 'duplicate' },
      { ...seed.school_contracts[0], id: 'outsider', student_id: 's4' },
      { ...seed.school_contracts[2], id: 'other-org', organization_id: 'other', order_snapshot: null },
      { ...seed.school_contracts[2], id: 'other-group', class_group_id: 'other', order_snapshot: null },
    );
    const db = schoolGroupDatabase(seed);
    const groups = await attachSchoolGroupMinimumStatus(db.client, 'school', [{
      id: 'group', members: seed.school_class_group_members as Array<{ student_id: string }>,
    }, { id: 'no-contracts' }]);
    expect(groups[0].minimum_status).toEqual({ eligible_student_count: 1, unconfirmed_student_ids: ['s3'] });
    expect(groups[1]).not.toHaveProperty('minimum_status');
  });

  it('keeps two remaining real members running when their group minimum is two', async () => {
    const seed = groupSeed(2);
    seed.school_contracts[0].terminated_at = '2026-09-28T08:00:00.000Z';
    const db = schoolGroupDatabase(seed);
    expect(await exit(db)).toMatchObject({ groupSuspended: false, activeStudentCount: 2, minimumStudentCount: 2 });
    expect(db.tables.school_class_groups[0].suspension_started_at).toBeUndefined();
    expect(db.tables.school_class_group_members.map(row => row.student_id)).toEqual(['s2', 's3']);
  });

  it('pauses only the affected group and its remaining contracts below three', async () => {
    const seed = groupSeed(3);
    seed.school_contracts[0].terminated_at = '2026-09-28T08:00:00.000Z';
    seed.school_class_groups.push({ id: 'other', organization_id: 'school', name: 'Other', minimum_active_students: 3 });
    seed.school_contracts.push({ ...seed.school_contracts[1], id: 'other-contract', class_group_id: 'other' });
    const db = schoolGroupDatabase(seed);
    expect(await exit(db)).toMatchObject({ groupSuspended: true, activeStudentCount: 2, minimumStudentCount: 3, suspendedContractCount: 2, notificationsSent: 0, notificationsAttempted: 0 });
    expect(db.tables.school_class_groups[1].suspension_started_at).toBeUndefined();
    expect(db.tables.school_contracts[3].suspension_started_at).toBeUndefined();
    expect(db.tables.school_contracts.slice(1, 3).map(row => row.suspension_scope)).toEqual(['group_under_minimum', 'group_under_minimum']);
    expect((await exit(db)).groupJustSuspended).toBe(false);
    expect(materialize).toHaveBeenCalledTimes(2);
  });

  it('pauses later accepted contracts without restarting an already paused group, then resumes at three', async () => {
    const seed = groupSeed();
    seed.school_contracts[1].accepted_at = null;
    seed.school_contracts[2].accepted_at = null;
    const db = schoolGroupDatabase(seed);
    const reconcile = (actorUserId: string) => reconcileSchoolGroupMinimum(
      { headers: {} } as any, db.client,
      { organizationId: 'school', groupId: 'group', actorUserId },
    );

    await reconcile('first-parent');
    const firstPause = db.tables.school_contracts[0].suspension_started_at;
    const groupPause = db.tables.school_class_groups[0].suspension_started_at;
    const groupReason = db.tables.school_class_groups[0].suspension_reason;
    expect(firstPause).toEqual(expect.any(String));
    expect(groupPause).toEqual(expect.any(String));
    expect(db.tables.school_contracts[0].suspension_scope).toBe('group_under_minimum');
    const groupWrites = db.requests.filter(row => row.table === 'school_class_groups' && row.method === 'PATCH').length;
    const notificationLookups = db.requests.filter(row => row.table === 'organizations' && row.method === 'GET').length;

    db.tables.school_contracts[1].accepted_at = '2026-09-01T09:00:00.000Z';
    await reconcile('second-parent');
    const secondPause = db.tables.school_contracts[1].suspension_started_at;
    expect(secondPause).toEqual(expect.any(String));
    expect(db.tables.school_contracts[1].suspension_scope).toBe('group_under_minimum');
    expect(db.tables.school_contracts[1].suspension_started_by).toBeNull();
    expect(db.tables.school_contracts[0].suspension_started_at).toBe(firstPause);
    expect(db.tables.school_class_groups[0].suspension_started_at).toBe(groupPause);
    expect(db.tables.school_class_groups[0].suspension_reason).toBe(groupReason);
    expect(db.requests.filter(row => row.table === 'school_class_groups' && row.method === 'PATCH')).toHaveLength(groupWrites);
    expect(db.requests.filter(row => row.table === 'organizations' && row.method === 'GET')).toHaveLength(notificationLookups);

    await reconcile('second-parent');
    expect(db.tables.school_contracts[1].suspension_started_at).toBe(secondPause);
    expect(db.requests.filter(row => row.table === 'organizations' && row.method === 'GET')).toHaveLength(notificationLookups);

    db.tables.school_contracts[2].accepted_at = '2026-09-01T10:00:00.000Z';
    await reconcile('third-parent');
    expect(db.tables.school_class_groups[0].suspension_resumed_at).toEqual(expect.any(String));
    expect(db.tables.school_contracts.slice(0, 2).every(row => row.suspension_resumed_at)).toBe(true);
    expect(db.tables.school_contracts[2].suspension_started_at).toBeUndefined();
  });

  it('ignores nonmembers, detached children and duplicate agreements in its impact preview', async () => {
    const seed = groupSeed();
    seed.school_contracts.push({ ...seed.school_contracts[1], id: 'duplicate' });
    seed.school_contracts.push({ ...seed.school_contracts[1], id: 'outsider', student_id: 's4' });
    seed.students.push({ id: 's4', organization_id: 'school' });
    seed.students[2].detached_at = '2026-09-01';
    const db = schoolGroupDatabase(seed);
    expect(await previewSchoolGroupContractExit(db.client, 'school', 'group', 'c1')).toMatchObject({ activeStudentCount: 2, remainingActiveStudentCount: 1, minimumStudentCount: 3 });
  });

  it('does not count unaccepted signed copies or expired service orders', async () => {
    const seed = groupSeed();
    seed.school_contracts[1].accepted_at = null;
    seed.school_contracts[2].order_snapshot = { end_date: '2020-01-01' };
    const db = schoolGroupDatabase(seed);
    expect(await previewSchoolGroupContractExit(db.client, 'school', 'group', 'c1')).toMatchObject({ activeStudentCount: 1, remainingActiveStudentCount: 0 });
  });

  it('automatically resumes the roster when the administrator lowers its threshold to two', async () => {
    const seed = groupSeed();
    seed.school_contracts[0].terminated_at = '2026-09-28T08:00:00.000Z';
    const db = schoolGroupDatabase(seed);
    await exit(db);
    db.tables.school_class_groups[0].minimum_active_students = 2;
    await reconcileSchoolGroupMinimum({ headers: {} } as any, db.client, { organizationId: 'school', groupId: 'group', actorUserId: 'admin' });
    expect(db.tables.school_class_groups[0].suspension_resumed_at).toEqual(expect.any(String));
    expect(db.tables.school_contracts.slice(1).every(row => row.suspension_resumed_at)).toBe(true);
    expect(db.tables.school_contracts[0].suspension_resumed_at).toBeUndefined();
  });

  it('counts an individually paused saved membership only when that exact contract is resumed', async () => {
    const seed = groupSeed();
    seed.school_contracts[0].suspension_started_at = '2026-09-01T08:00:00.000Z';
    seed.school_contracts[0].suspension_scope = 'individual';
    const original = structuredClone(seed.school_class_group_members[0]);
    const db = schoolGroupDatabase(seed);
    await exit(db);
    expect(await resumeSchoolGroupIfMinimumMet(db.client, { organizationId: 'school', groupId: 'group', resumeContractId: null, adminUserId: 'admin' })).toMatchObject({ resumed: false, resumableStudentCount: 2 });
    expect(await resumeSchoolGroupIfMinimumMet(db.client, { organizationId: 'school', groupId: 'group', resumeContractId: 'c1', adminUserId: 'admin' })).toMatchObject({ resumed: true, resumableStudentCount: 3 });
    expect(db.tables.school_class_group_members).toContainEqual(original);
  });

  it('resumes after a new roster member accepts their agreement', async () => {
    const seed = groupSeed();
    seed.school_contracts[0].terminated_at = '2026-09-28T08:00:00.000Z';
    const db = schoolGroupDatabase(seed);
    await exit(db);
    db.tables.students.push({ id: 's4', organization_id: 'school' });
    db.tables.school_class_group_members.push({ group_id: 'group', student_id: 's4', enrolled_at: '2026-09-28', schedule_slots: null });
    db.tables.school_contracts.push({ ...db.tables.school_contracts[0], id: 'c4', student_id: 's4', terminated_at: null });
    await reconcileSchoolGroupMinimum({ headers: {} } as any, db.client, { organizationId: 'school', groupId: 'group', actorUserId: 'parent' });
    expect(db.tables.school_class_groups[0].suspension_resumed_at).toEqual(expect.any(String));
  });

  it('restores a resumed valid revision using a different eligible revision’s saved roster', async () => {
    const seed = groupSeed();
    const original = seed.school_class_group_members.shift()!;
    seed.school_contracts[0].suspension_started_at = '2026-09-01';
    seed.school_contracts[0].suspension_scope = 'individual';
    seed.school_contracts.push({ ...seed.school_contracts[0], id: 'saved-revision', suspended_group_membership: original });
    seed.school_class_groups[0].suspension_started_at = '2026-09-02';
    seed.school_contracts.slice(1, 3).forEach(row => { row.suspension_started_at = '2026-09-02'; row.suspension_scope = 'group_under_minimum'; });
    const db = schoolGroupDatabase(seed);
    expect(await resumeSchoolGroupIfMinimumMet(db.client, { organizationId: 'school', groupId: 'group', resumeContractId: 'c1', adminUserId: 'admin' })).toMatchObject({ resumed: true, resumableStudentCount: 3 });
    expect(db.tables.school_class_group_members).toContainEqual(original);
  });

  it('lets the cron resume a viable restored roster and perform its own session reconciliation once', async () => {
    const seed = groupSeed();
    seed.school_class_groups[0].suspension_started_at = '2026-09-02';
    seed.school_contracts.slice(1).forEach(row => { row.suspension_started_at = '2026-09-02'; row.suspension_scope = 'group_under_minimum'; });
    const db = schoolGroupDatabase(seed);
    expect(await resumeSchoolGroupIfMinimumMet(db.client, { organizationId: 'school', groupId: 'group', resumeContractId: null, adminUserId: null, materialize: false })).toMatchObject({ resumed: true, resumableStudentCount: 3 });
    expect(materialize).not.toHaveBeenCalled();
    expect(db.tables.school_class_groups[0].suspension_resumed_at).toEqual(expect.any(String));
  });
});
