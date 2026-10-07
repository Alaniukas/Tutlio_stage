import { describe, expect, it } from 'vitest';
import {
  evaluateSchoolGroupMinimumRisk,
  listSchoolGroupsAtRisk,
  SCHOOL_GROUP_MINIMUM_RISK_WINDOW_MS,
} from '../../src/lib/schoolGroupMinimumAtRisk';

const baseGroup = {
  id: 'group-1',
  name: 'STEAM',
  minimum_active_students: 2,
  duration_minutes: 45,
  slots: [{ weekday: 3, start_time: '16:00', end_time: '16:45' }],
  minimum_status: { eligible_student_count: 1, unconfirmed_student_ids: ['s2'] },
};

describe('schoolGroupMinimumAtRisk', () => {
  it('flags active groups below minimum with a slot inside the warning window', () => {
    const now = new Date('2026-10-06T10:00:00.000Z'); // Monday
    const risk = evaluateSchoolGroupMinimumRisk(baseGroup, now);
    expect(risk.atRisk).toBe(true);
    expect(risk.eligibleCount).toBe(1);
    expect(risk.minimum).toBe(2);
    expect(risk.occurrenceStart).toBeTruthy();
    const delta = risk.occurrenceStart!.getTime() - now.getTime();
    expect(delta).toBeGreaterThan(0);
    expect(delta).toBeLessThanOrEqual(SCHOOL_GROUP_MINIMUM_RISK_WINDOW_MS);
  });

  it('ignores suspended groups and groups already at minimum', () => {
    const now = new Date('2026-10-06T10:00:00.000Z');
    expect(evaluateSchoolGroupMinimumRisk({
      ...baseGroup,
      suspension_started_at: '2026-10-01T08:00:00.000Z',
    }, now).atRisk).toBe(false);
    expect(evaluateSchoolGroupMinimumRisk({
      ...baseGroup,
      minimum_status: { eligible_student_count: 2, unconfirmed_student_ids: [] },
    }, now).atRisk).toBe(false);
  });

  it('ignores occurrences outside the configured warning window', () => {
    const now = new Date('2026-10-06T10:00:00.000Z');
    const risk = evaluateSchoolGroupMinimumRisk(baseGroup, now, 24 * 3600000);
    expect(risk.atRisk).toBe(false);
  });

  it('lists only at-risk groups', () => {
    const now = new Date('2026-10-06T10:00:00.000Z');
    const rows = listSchoolGroupsAtRisk([
      baseGroup,
      { ...baseGroup, id: 'group-2', minimum_status: { eligible_student_count: 2, unconfirmed_student_ids: [] } },
    ], now);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('group-1');
  });
});
