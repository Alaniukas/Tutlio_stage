import { describe, expect, it } from 'vitest';
import {
  mvNeedsAnyAccountProvisioning,
  mvNeedsParentAccount,
  mvNeedsStudentAccount,
  mergeMvStudentAccountStatus,
  mvProvisionStudentIds,
} from '@/lib/mvStudentAccountStatus';

describe('mvStudentAccountStatus', () => {
  it('detects missing parent and student accounts', () => {
    expect(
      mvNeedsParentAccount({ payer_email: 'p@example.com', parent_user_id: null }),
    ).toBe(true);
    expect(
      mvNeedsStudentAccount({ email: 's@example.com', linked_user_id: null }),
    ).toBe(true);
    expect(
      mvNeedsAnyAccountProvisioning({
        payer_email: 'p@example.com',
        email: 's@example.com',
        parent_user_id: null,
        linked_user_id: null,
      }),
    ).toBe(true);
  });

  it('returns false when accounts are linked', () => {
    expect(
      mvNeedsAnyAccountProvisioning({
        payer_email: 'p@example.com',
        email: 's@example.com',
        parent_user_id: 'uid-parent',
        linked_user_id: 'uid-student',
      }),
    ).toBe(false);
  });

  it('allows selecting a missing parent account before an email is entered', () => {
    expect(mvNeedsParentAccount({ payer_email: null, parent_user_id: null })).toBe(true);
  });

  it('combines account links stored on separate tutor rows', () => {
    expect(mergeMvStudentAccountStatus([
      { full_name: 'Child', payer_email: 'parent@example.test', parent_user_id: 'parent-user' },
      { full_name: 'Child', email: 'child@example.test', linked_user_id: 'student-user' },
    ])).toMatchObject({
      linked_user_id: 'student-user',
      parent_user_id: 'parent-user',
      email: 'child@example.test',
      payer_email: 'parent@example.test',
    });
  });

  it('keeps one best row per tutor when a historical retry made a duplicate', () => {
    expect(mvProvisionStudentIds([
      { id: 'empty-duplicate', tutor_id: 'tutor-1', full_name: 'Child' },
      { id: 'linked', tutor_id: 'tutor-1', linked_user_id: 'student-user' },
      { id: 'second-tutor', tutor_id: 'tutor-2' },
    ])).toEqual(['linked', 'second-tutor']);
  });
});
