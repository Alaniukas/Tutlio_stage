import { describe, expect, it } from 'vitest';
import {
  activeSchoolGroupStudentIds,
  isSchoolClassGroupSuspended,
  resumableSchoolGroupStudentIds,
  schoolGroupExitImpact,
} from '../../src/lib/schoolGroupMinimumPolicy';

const signed = (id: string, studentId: string, extra: Record<string, unknown> = {}) => ({
  id,
  student_id: studentId,
  signing_status: 'signed',
  ...extra,
});

describe('school group minimum policy', () => {
  const now = new Date('2026-09-19T10:00:00.000Z');

  it('detects when one exit leaves only two active students', () => {
    const contracts = [signed('c1', 's1'), signed('c2', 's2'), signed('c3', 's3')];
    expect(schoolGroupExitImpact(contracts, 'c1', now)).toEqual({
      targetStudentId: 's1',
      activeStudentCount: 3,
      remainingActiveStudentCount: 2,
      willFallBelowMinimum: true,
    });
  });

  it('counts students rather than duplicate contract rows', () => {
    const contracts = [signed('c1', 's1'), signed('c1-old', 's1'), signed('c2', 's2'), signed('c3', 's3'), signed('c4', 's4')];
    expect(activeSchoolGroupStudentIds(contracts, now).size).toBe(4);
    expect(schoolGroupExitImpact(contracts, 'c1', now).willFallBelowMinimum).toBe(false);
  });

  it('keeps a student active when another valid contract still covers the same group', () => {
    const contracts = [signed('c1', 's1'), signed('c1-old', 's1'), signed('c2', 's2'), signed('c3', 's3')];
    expect(schoolGroupExitImpact(contracts, 'c1', now)).toMatchObject({
      activeStudentCount: 3,
      remainingActiveStudentCount: 3,
      willFallBelowMinimum: false,
    });
  });

  it('does not count terminated or individually suspended members toward a restart', () => {
    const contracts = [
      signed('c1', 's1', { suspension_started_at: '2026-09-18T08:00:00Z', suspension_scope: 'individual' }),
      signed('c2', 's2', { suspension_started_at: '2026-09-18T08:00:00Z', suspension_scope: 'group_under_minimum' }),
      signed('c3', 's3', { suspension_started_at: '2026-09-18T08:00:00Z', suspension_scope: 'group_under_minimum' }),
      signed('c4', 's4', { terminated_at: '2026-09-18T08:00:00Z' }),
    ];
    expect(resumableSchoolGroupStudentIds(contracts, null, now)).toEqual(new Set(['s2', 's3']));
    expect(resumableSchoolGroupStudentIds(contracts, 'c1', now)).toEqual(new Set(['s1', 's2', 's3']));
  });

  it('treats a dated group suspension as active only through its last day', () => {
    const group = { suspension_started_at: '2026-09-10T08:00:00Z', suspension_until: '2026-09-19' };
    expect(isSchoolClassGroupSuspended(group, now)).toBe(true);
    expect(isSchoolClassGroupSuspended(group, new Date('2026-09-20T10:00:00Z'))).toBe(false);
  });
});
