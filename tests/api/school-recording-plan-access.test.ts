// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordingSlotScope, recordingVisibleToScope, schoolGroupRecordingStudentIds } from '../../api/_lib/schoolRecordingSlotAccess';
import { applyAcceptedSchoolGroupRecordingPlan } from '../../api/_lib/schoolGroupMembership';
import { groupSeed, schoolGroupDatabase } from '../fixtures/schoolGroupDatabase';

const monday = { weekday: 1, start_time: '18:00' };
const thursday = { weekday: 4, start_time: '18:00' };
const context = { organizationId: 'school', features: { school_family_portal: true, school_lesson_recordings: true } };
function fixture(mode: 'group' | 'none' | 'schedule') {
  const seed = groupSeed();
  seed.organizations[0].entity_type = 'school'; seed.organizations[0].features = context.features;
  seed.school_class_group_slots = [monday, thursday].map((slot) => ({ group_id: 'group', ...slot }));
  seed.school_class_group_members[0].recording_access = mode;
  seed.school_contracts[0].order_snapshot = { recording_access: mode, schedule_slots: [thursday], end_date: '2027-06-15' };
  return schoolGroupDatabase(seed);
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-28T12:00:00Z')); });
afterEach(() => { vi.useRealTimers(); });

describe('live recording plan authorization with real PostgREST queries', () => {
  it('grants whole-group recordings independently from one attended slot', async () => {
    const db = fixture('group');
    const scope = await recordingSlotScope(db.client, 'group', ['s1'], false, context);
    expect(recordingVisibleToScope(scope, thursday)).toBe(true);
    expect(recordingVisibleToScope(scope, null)).toBe(true);
    expect(await schoolGroupRecordingStudentIds(db.client, { ...context, groupId: 'group', studentIds: ['s1', 's2'] })).toEqual(['s1', 's2']);
  });

  it('denies no-recording plans, but preserves independent admin access and other children', async () => {
    const db = fixture('none');
    expect(recordingVisibleToScope(await recordingSlotScope(db.client, 'group', ['s1'], false, context), monday)).toBe(false);
    expect(await schoolGroupRecordingStudentIds(db.client, { ...context, groupId: 'group', studentIds: ['s1', 's2'] })).toEqual(['s2']);
    expect(recordingVisibleToScope(await recordingSlotScope(db.client, 'group', ['s1'], true, context), null)).toBe(true);
  });

  it('preserves unrelated-school selected-slot behavior when the opt-in flag is off', async () => {
    const db = fixture('none');
    const scope = await recordingSlotScope(db.client, 'group', ['s1'], false, { ...context, features: {} });
    expect(recordingVisibleToScope(scope, monday)).toBe(true);
    expect(recordingVisibleToScope(scope, thursday)).toBe(false);
    expect(db.requests.some((request) => request.table === 'school_contracts')).toBe(false);
  });

  it('keeps legitimate competing contract access and rechecks its revocation on the next request', async () => {
    const db = fixture('none');
    db.tables.school_contracts.push({ ...db.tables.school_contracts[0], id: 'second', order_snapshot: { recording_access: 'group', schedule_slots: [monday] } });
    expect(recordingVisibleToScope(await recordingSlotScope(db.client, 'group', ['s1'], false, context), null)).toBe(true);
    db.tables.school_contracts.at(-1)!.terminated_at = '2026-09-28';
    expect(recordingVisibleToScope(await recordingSlotScope(db.client, 'group', ['s1'], false, context), monday)).toBe(false);
  });

  it('keeps an explicit schedule grant attached to its purchased slot', async () => {
    const db = fixture('schedule');
    const scope = await recordingSlotScope(db.client, 'group', ['s1'], false, context);
    expect(recordingVisibleToScope(scope, thursday)).toBe(true);
    expect(recordingVisibleToScope(scope, monday)).toBe(false);
  });

  it('projects accepted one-slot attendance idempotently without resetting enrollment', async () => {
    const db = fixture('none');
    const enrolledAt = db.tables.school_class_group_members[0].enrolled_at;
    await applyAcceptedSchoolGroupRecordingPlan(db.client, 'c1', 'school');
    await applyAcceptedSchoolGroupRecordingPlan(db.client, 'c1', 'school');
    expect(db.tables.school_class_group_members[0]).toMatchObject({ schedule_slots: [thursday], recording_access: 'none', enrolled_at: enrolledAt });
    expect(db.requests.find((request) => request.method === 'POST')?.headers.get('Prefer')).toContain('missing=default');
    expect(db.tables.school_class_group_members[1].schedule_slots).toEqual([monday]);
  });

  it('preserves attendance covered by a competing legacy agreement and respects disabled flags', async () => {
    const db = fixture('none');
    db.tables.school_contracts.push({ ...db.tables.school_contracts[0], id: 'legacy', order_snapshot: {} });
    await applyAcceptedSchoolGroupRecordingPlan(db.client, 'c1', 'school');
    expect(db.tables.school_class_group_members[0].schedule_slots).toEqual([thursday, monday]);
    expect(db.tables.school_class_group_members[0].legacy_recording_scope).toEqual({ schedule_slots: [monday] });
    const legacyGrant = await recordingSlotScope(db.client, 'group', ['s1'], false, context);
    expect(recordingVisibleToScope(legacyGrant, monday)).toBe(true);
    expect(recordingVisibleToScope(legacyGrant, thursday)).toBe(false);
    db.tables.organizations[0].features = {};
    db.tables.school_class_group_members[0].schedule_slots = [monday];
    await applyAcceptedSchoolGroupRecordingPlan(db.client, 'c1', 'school');
    expect(db.tables.school_class_group_members[0].schedule_slots).toEqual([monday]);
  });

  it('captures null/all distinctly from an absent roster and does not recapture changed attendance', async () => {
    const db = fixture('none');
    db.tables.school_class_group_members[0].schedule_slots = null;
    db.tables.school_contracts.push({ ...db.tables.school_contracts[0], id: 'legacy', order_snapshot: {} });
    await applyAcceptedSchoolGroupRecordingPlan(db.client, 'c1', 'school');
    expect(db.tables.school_class_group_members[0].legacy_recording_scope).toEqual({ schedule_slots: null });
    db.tables.school_class_group_members[0].schedule_slots = [thursday];
    await applyAcceptedSchoolGroupRecordingPlan(db.client, 'c1', 'school');
    expect(db.tables.school_class_group_members[0].legacy_recording_scope).toEqual({ schedule_slots: null });
    expect(recordingVisibleToScope(await recordingSlotScope(db.client, 'group', ['s1'], false, context), null)).toBe(true);
    const absent = fixture('none'); absent.tables.school_class_group_members = absent.tables.school_class_group_members.filter((member) => member.student_id !== 's1');
    await applyAcceptedSchoolGroupRecordingPlan(absent.client, 'c1', 'school');
    expect(absent.tables.school_class_group_members.find((member) => member.student_id === 's1')?.legacy_recording_scope).toEqual({ schedule_slots: [] });
  });
});
