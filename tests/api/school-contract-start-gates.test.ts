// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadExtraLessonsStartGates, materializeClassGroupNow, materializationWindow, reconcileClassGroupSessions } from '../../api/_lib/schoolClassGroupMaterialize';
import { buildExtraLessonsOrderSnapshot } from '../../src/lib/extraLessonsContract';
import { groupSeed, schoolGroupDatabase } from '../fixtures/schoolGroupDatabase';

const order = buildExtraLessonsOrderSnapshot({
  service_name: 'STEAM', service_type: 'group', platform: 'Google Meet', duration_minutes: 45,
  start_date: '2026-09-01', end_date: '2027-06-15', unit_price_eur: 12, base_lessons_per_month: 4,
  schedule_slots: [{ weekday: 1, start_time: '18:00' }], group_id: 'group',
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-28T10:00:00Z'));
});
afterEach(() => { vi.useRealTimers(); });

describe('extra contract materialization gates', () => {
  it('blocks ended and unsigned agreements even if a stale membership remains', async () => {
    const seed = groupSeed();
    seed.school_contracts.forEach(row => { row.order_snapshot = order; row.start_within_14_status = 'yes'; });
    seed.school_contracts[0].terminated_at = '2026-09-20';
    seed.school_contracts[1].signing_status = 'sent';
    const db = schoolGroupDatabase(seed);
    const gates = await loadExtraLessonsStartGates(db.client, 'school');
    expect(gates.get('s1:group')).toBe('9999-12-31');
    expect(gates.get('s2:group')).toBe('9999-12-31');
    expect(gates.get('s3:group')).toBe('2026-09-07');
    const now = new Date('2026-09-28T10:00:00Z');
    db.tables.sessions = [
      { id: 'ended-future', student_id: 's1', class_group_id: 'group', tutor_id: 'teacher', start_time: '2026-09-28T15:00:00Z', end_time: '2026-09-28T15:45:00Z', status: 'active' },
      { id: 'ended-history', student_id: 's1', class_group_id: 'group', tutor_id: 'teacher', start_time: '2026-09-21T15:00:00Z', end_time: '2026-09-21T15:45:00Z', status: 'completed' },
    ];
    await reconcileClassGroupSessions(db.client, {
      id: 'group', organization_id: 'school', tutor_id: 'teacher', school_year_start: '2026-09-01', school_year_end: '2027-06-15',
      slots: [{ weekday: 1, start_time: '18:00', end_time: '18:45' }], members: seed.school_class_group_members,
    }, { extraGates: gates, window: materializationWindow(now, 7) });
    expect(db.tables.sessions.some(row => row.id === 'ended-future')).toBe(false);
    expect(db.tables.sessions.some(row => row.id === 'ended-history')).toBe(true);
    expect(db.tables.sessions.filter(row => row.status === 'active').every(row => row.student_id === 's3')).toBe(true);
  });

  it('lets a current accepted revision override ended revisions in either database order', async () => {
    for (const reverse of [false, true]) {
      const seed = groupSeed();
      seed.school_contracts[0].order_snapshot = order;
      seed.school_contracts[0].start_within_14_status = 'yes';
      const ended = { ...seed.school_contracts[0], id: 'old', withdrawal_requested_at: '2026-09-20' };
      seed.school_contracts = reverse ? [ended, seed.school_contracts[0]] : [seed.school_contracts[0], ended];
      expect((await loadExtraLessonsStartGates(schoolGroupDatabase(seed).client, 'school')).get('s1:group')).toBe('2026-09-07');
    }
  });

  it('stops future generated lessons at the last date of an accepted service order', async () => {
    const seed = groupSeed();
    seed.sessions = [];
    seed.school_contracts.forEach(row => { row.order_snapshot = { ...order, end_date: '2026-10-01' }; row.start_within_14_status = 'yes'; });
    const db = schoolGroupDatabase(seed);
    const gates = await loadExtraLessonsStartGates(db.client, 'school');
    await reconcileClassGroupSessions(db.client, {
      id: 'group', organization_id: 'school', tutor_id: 'teacher', school_year_start: '2026-09-01', school_year_end: '2027-06-15',
      slots: [{ weekday: 1, start_time: '18:00', end_time: '18:45' }], members: seed.school_class_group_members,
    }, { extraGates: gates, window: materializationWindow(new Date('2026-09-28T10:00:00Z'), 14) });
    expect(db.tables.sessions).toHaveLength(3);
    expect(db.tables.sessions.every(row => row.start_time.slice(0, 10) === '2026-09-28')).toBe(true);
  });

  it('scopes expired membership restoration to the target group school when the caller omits the org', async () => {
    const seed = groupSeed();
    seed.school_class_groups[0].school_year_start = '2026-09-01';
    seed.school_class_groups[0].school_year_end = '2027-06-15';
    seed.school_class_groups[0].tutor_id = 'teacher';
    seed.school_contracts.push({
      ...seed.school_contracts[0], id: 'foreign', organization_id: 'other-school',
      suspended_group_membership: { group_id: 'foreign-group', student_id: 's1', enrolled_at: '2026-09-01', schedule_slots: null },
    });
    const db = schoolGroupDatabase(seed);
    await materializeClassGroupNow(db.client, 'group');
    expect(db.requests.filter(request => request.method !== 'GET')).toEqual([]);
    expect(db.tables.school_contracts.at(-1)!.suspended_group_membership).not.toBeNull();
  });
});
