// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { restoreExpiredSchoolGroupMemberships, syncSchoolContractGroupMembership } from '../../api/_lib/schoolGroupMembership';
import { groupSeed, schoolGroupDatabase } from '../fixtures/schoolGroupDatabase';

describe('contract group membership lifecycle', () => {
  it('removes one individually paused child and restores their exact date and schedule on resume', async () => {
    const seed = groupSeed();
    seed.school_class_group_members[0].recording_access = 'none';
    seed.school_class_group_members[0].legacy_recording_scope = { schedule_slots: [{ weekday: 4, start_time: '18:00' }] };
    const original = structuredClone(seed.school_class_group_members[0]);
    seed.school_class_group_members.push({ ...original, group_id: 'other-group' });
    seed.school_contracts[0].suspension_started_at = '2026-09-01T08:00:00.000Z';
    seed.school_contracts[0].suspension_scope = 'individual';
    const db = schoolGroupDatabase(seed);
    await syncSchoolContractGroupMembership(db.client, 'c1', 'school');
    expect(db.tables.school_class_group_members).not.toContainEqual(original);
    expect(db.tables.school_class_group_members).toContainEqual({ ...original, group_id: 'other-group' });
    expect(db.tables.school_contracts[0].suspended_group_membership).toEqual(original);
    await syncSchoolContractGroupMembership(db.client, 'c1', 'school');
    expect(db.tables.school_contracts[0].suspended_group_membership).toEqual(original);
    db.tables.school_contracts[0].suspension_resumed_at = '2026-09-28T08:00:00.000Z';
    await syncSchoolContractGroupMembership(db.client, 'c1', 'school');
    await syncSchoolContractGroupMembership(db.client, 'c1', 'school');
    expect(db.tables.school_class_group_members.filter(row => row.group_id === 'group' && row.student_id === 's1')).toEqual([original]);
    expect(db.tables.school_contracts[0].suspended_group_membership).toBeNull();
    expect(db.tables.sessions).toEqual(seed.sessions);
  });

  it('recovers an interrupted removal and an interrupted snapshot clear without losing the original enrollment', async () => {
    const seed = groupSeed();
    seed.school_contracts[0].suspension_started_at = '2026-09-01T08:00:00.000Z';
    seed.school_contracts[0].suspension_scope = 'individual';
    const original = structuredClone(seed.school_class_group_members[0]);
    const db = schoolGroupDatabase(seed);
    db.failNext('school_class_group_members', 'DELETE');
    await expect(syncSchoolContractGroupMembership(db.client, 'c1', 'school')).rejects.toThrow('Injected');
    await syncSchoolContractGroupMembership(db.client, 'c1', 'school');
    db.tables.school_contracts[0].suspension_resumed_at = '2026-09-28T08:00:00.000Z';
    db.failNext('school_contracts', 'PATCH');
    await expect(syncSchoolContractGroupMembership(db.client, 'c1', 'school')).rejects.toThrow('Injected');
    expect(db.tables.school_class_group_members).toContainEqual(original);
    await syncSchoolContractGroupMembership(db.client, 'c1', 'school');
    expect(db.tables.school_class_group_members.filter(row => row.student_id === 's1')).toEqual([original]);
    expect(db.tables.school_contracts[0].suspended_group_membership).toBeNull();
  });

  it('keeps a member covered by another valid matching agreement, then removes them after its final end', async () => {
    const seed = groupSeed();
    seed.school_contracts[0].withdrawal_requested_at = '2026-09-28T08:00:00.000Z';
    seed.school_contracts.push({ ...seed.school_contracts[0], id: 'replacement', withdrawal_requested_at: null });
    const db = schoolGroupDatabase(seed);
    await syncSchoolContractGroupMembership(db.client, 'c1', 'school');
    expect(db.tables.school_class_group_members).toHaveLength(3);
    db.tables.school_contracts[3].terminated_at = '2026-09-28T09:00:00.000Z';
    await syncSchoolContractGroupMembership(db.client, 'replacement', 'school');
    await syncSchoolContractGroupMembership(db.client, 'replacement', 'school');
    expect(db.tables.school_class_group_members.map(row => row.student_id)).toEqual(['s2', 's3']);
    expect(db.tables.sessions).toEqual(seed.sessions);
  });

  it('restores expired individual pauses only in the requested school and never revives ended contracts', async () => {
    const seed = groupSeed();
    seed.school_contracts[0].suspension_started_at = '2020-01-01T08:00:00.000Z';
    seed.school_contracts[0].suspension_until = '2020-01-02';
    seed.school_contracts[0].suspended_group_membership = seed.school_class_group_members.shift();
    seed.school_contracts[1].terminated_at = '2026-09-01T08:00:00.000Z';
    seed.school_contracts[1].suspended_group_membership = seed.school_class_group_members.shift();
    const db = schoolGroupDatabase(seed);
    await restoreExpiredSchoolGroupMemberships(db.client, 'school');
    expect(db.tables.school_class_group_members.map(row => row.student_id).sort()).toEqual(['s1', 's3']);
    expect(db.tables.school_contracts[1].suspended_group_membership).not.toBeNull();
  });

  it('resumes one valid revision from the membership saved by another paused revision', async () => {
    const seed = groupSeed();
    const original = structuredClone(seed.school_class_group_members[0]);
    seed.school_contracts.push({ ...seed.school_contracts[0], id: 'revision-b' });
    const db = schoolGroupDatabase(seed);
    db.tables.school_contracts[0].suspension_started_at = '2026-09-01';
    db.tables.school_contracts[0].suspension_scope = 'individual';
    await syncSchoolContractGroupMembership(db.client, 'c1', 'school');
    expect(db.tables.school_contracts[0].suspended_group_membership).toBeNull();
    db.tables.school_contracts[3].suspension_started_at = '2026-09-02';
    db.tables.school_contracts[3].suspension_scope = 'individual';
    await syncSchoolContractGroupMembership(db.client, 'revision-b', 'school');
    expect(db.tables.school_contracts[3].suspended_group_membership).toEqual(original);
    db.tables.school_contracts[0].suspension_resumed_at = '2026-09-28';
    await syncSchoolContractGroupMembership(db.client, 'c1', 'school');
    expect(db.tables.school_class_group_members).toContainEqual(original);
    expect(db.tables.school_contracts[3].suspended_group_membership).toBeNull();
  });

  it('preserves the original snapshot for a valid paused revision when its active sibling ends', async () => {
    const seed = groupSeed();
    const original = structuredClone(seed.school_class_group_members[0]);
    seed.school_contracts[0].suspension_started_at = '2026-09-01';
    seed.school_contracts[0].suspension_scope = 'individual';
    seed.school_contracts.push({ ...seed.school_contracts[0], id: 'revision-b', suspension_started_at: null, terminated_at: '2026-09-02' });
    const db = schoolGroupDatabase(seed);
    await syncSchoolContractGroupMembership(db.client, 'revision-b', 'school');
    expect(db.tables.school_contracts[0].suspended_group_membership).toEqual(original);
    db.tables.school_contracts[0].suspension_resumed_at = '2026-09-28';
    await syncSchoolContractGroupMembership(db.client, 'c1', 'school');
    expect(db.tables.school_class_group_members).toContainEqual(original);
  });

  it('does not let a merely signed unaccepted revision retain an ended membership', async () => {
    const seed = groupSeed();
    seed.school_contracts[0].terminated_at = '2026-09-28';
    seed.school_contracts.push({ ...seed.school_contracts[0], id: 'unaccepted', terminated_at: null, accepted_at: null });
    const db = schoolGroupDatabase(seed);
    await syncSchoolContractGroupMembership(db.client, 'c1', 'school');
    expect(db.tables.school_class_group_members.map(row => row.student_id)).toEqual(['s2', 's3']);
  });
});
