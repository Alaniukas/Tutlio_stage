import { describe, expect, it } from 'vitest';
import {
  isParentVisibleSchoolContract,
  mapExtraLessonsParentContract,
  mapParentSchoolContract,
  parentMayEndExtraLessonsContract,
  parentSchoolContractStatusI18nKey,
  uniqueStudentIds,
} from '../../src/lib/extraLessonsParentPortal';

describe('extraLessonsParentPortal', () => {
  it('dedupes student ids from parent_profiles, parent_user_id and linked_user_id rows', () => {
    expect(uniqueStudentIds([
      { id: 'a' },
      { id: 'b' },
      { id: 'a' },
      { id: null },
      null,
    ])).toEqual(['a', 'b']);
  });

  it('lets the linked parent end a contract even if they did not click-wrap', () => {
    const parentId = 'parent-1';
    expect(parentMayEndExtraLessonsContract({
      authUserId: parentId,
      acceptedByUserId: 'someone-else',
      studentLinkedUserId: null,
      studentParentUserId: parentId,
    })).toBe(true);
    expect(parentMayEndExtraLessonsContract({
      authUserId: parentId,
      acceptedByUserId: parentId,
      studentLinkedUserId: null,
      studentParentUserId: null,
    })).toBe(true);
    expect(parentMayEndExtraLessonsContract({
      authUserId: parentId,
      acceptedByUserId: null,
      studentLinkedUserId: parentId,
      studentParentUserId: null,
    })).toBe(true);
    expect(parentMayEndExtraLessonsContract({
      authUserId: parentId,
      acceptedByUserId: 'other',
      studentLinkedUserId: 'other',
      studentParentUserId: 'other',
    })).toBe(false);
  });

  it('shows Atsisakyti inside 14 days and Nutraukti after, never both', () => {
    const base = {
      id: 'c1',
      contract_number: 'PP-LEGAL-WITHDRAW',
      revision_label: 'QA-legal-v1',
      accepted_at: '2026-08-01T10:00:00.000Z',
      signed_contract_url: 'org/c1.pdf',
      pdf_url: null,
      extra_end_statement_path: null,
      withdrawal_requested_at: null,
      extra_end_kind: null,
      start_within_14_status: 'yes' as const,
      student_id: 's1',
    };
    const inside = mapExtraLessonsParentContract(base, 'QA Vaikas', new Date('2026-08-10T10:00:00Z'));
    expect(inside.canWithdraw).toBe(true);
    expect(inside.canTerminate).toBe(false);
    const after = mapExtraLessonsParentContract(base, 'QA Vaikas', new Date('2026-08-20T10:00:00Z'));
    expect(after.canWithdraw).toBe(false);
    expect(after.canTerminate).toBe(true);
    const done = mapExtraLessonsParentContract(
      { ...base, withdrawal_requested_at: '2026-08-05T10:00:00.000Z', extra_end_kind: 'withdrawal' },
      'QA Vaikas',
      new Date('2026-08-06T10:00:00Z'),
    );
    expect(done.canWithdraw).toBe(false);
    expect(done.canTerminate).toBe(false);
    expect(done.withdrawn).toBe(true);
  });

  it('lists annual school contracts without extra-lessons end actions', () => {
    const mapped = mapParentSchoolContract({
      id: 'annual-1',
      contract_number: 'UG-1',
      revision_label: null,
      accepted_at: null,
      signed_contract_url: 'org/a.pdf',
      pdf_url: null,
      extra_end_statement_path: null,
      withdrawal_requested_at: null,
      extra_end_kind: null,
      start_within_14_status: null,
      student_id: 's1',
      kind: 'annual',
      signing_status: 'signed',
    }, 'QA Vaikas');
    expect(mapped.kind).toBe('annual');
    expect(mapped.hasPdf).toBe(true);
    expect(mapped.canWithdraw).toBe(false);
    expect(mapped.canTerminate).toBe(false);
    expect(parentSchoolContractStatusI18nKey('signed')).toBe('school.filterSigned');
    expect(isParentVisibleSchoolContract({ party_kind: 'teacher' })).toBe(false);
    expect(isParentVisibleSchoolContract({ party_kind: 'student' })).toBe(true);
  });
});
