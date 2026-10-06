import { describe, expect, it } from 'vitest';
import {
  buildSchoolGroupActivationSummary,
  classifySchoolGroupMemberActivation,
  pickSchoolGroupMemberContract,
} from '../../src/lib/schoolGroupMemberActivation';

const signed = (id: string, studentId: string, extra: Record<string, unknown> = {}) => ({
  id,
  student_id: studentId,
  signing_status: 'signed',
  ...extra,
});

describe('schoolGroupMemberActivation', () => {
  const now = new Date('2026-09-19T10:00:00.000Z');
  const group = {
    minimum_active_students: 2,
    members: [
      { student_id: 's1', student: { full_name: 'Kairiūnas Sara' } },
      { student_id: 's2', student: { full_name: 'Baltranaitė Deimilė Austėja' } },
      { student_id: 's3', student: { full_name: 'Palskė Neda' } },
    ],
  };

  it('marks only signed contracts as active members', () => {
    const contracts = [
      signed('c1', 's1'),
      { id: 'c2', student_id: 's2', signing_status: 'sent' },
      { id: 'c3', student_id: 's3', signing_status: 'draft' },
    ];
    const summary = buildSchoolGroupActivationSummary(group, contracts, now);
    expect(summary.activeCount).toBe(1);
    expect(summary.minimum).toBe(2);
    expect(summary.offerPending.map((member) => member.fullName)).toEqual(['Baltranaitė Deimilė Austėja']);
    expect(summary.waitingForContract.map((member) => member.fullName)).toEqual(['Palskė Neda']);
  });

  it('prefers an active signed contract over an older sent offer', () => {
    const contracts = [
      { id: 'c-old', student_id: 's1', signing_status: 'sent' },
      signed('c-new', 's1'),
    ];
    expect(pickSchoolGroupMemberContract(contracts, 's1', now)?.id).toBe('c-new');
    expect(classifySchoolGroupMemberActivation(pickSchoolGroupMemberContract(contracts, 's1', now), now)).toBe('active');
  });
});
