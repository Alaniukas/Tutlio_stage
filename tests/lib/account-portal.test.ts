import { describe, expect, it } from 'vitest';
import {
  canAccessLoginPortal,
  loginErrorKeyForPortalMismatch,
  profileQualifiesAsTutor,
  type AccountPortals,
} from '../../src/lib/account-portal';

describe('canAccessLoginPortal', () => {
  it('allows each portal only when the matching account exists', () => {
    const tutorOnly: AccountPortals = { orgAdmin: false, parent: false, student: false, tutor: true };
    expect(canAccessLoginPortal(tutorOnly, 'tutor')).toBe(true);
    expect(canAccessLoginPortal(tutorOnly, 'student')).toBe(false);
    expect(canAccessLoginPortal(tutorOnly, 'parent')).toBe(false);

    const studentOnly: AccountPortals = { orgAdmin: false, parent: false, student: true, tutor: false };
    expect(canAccessLoginPortal(studentOnly, 'student')).toBe(true);
    expect(canAccessLoginPortal(studentOnly, 'tutor')).toBe(false);
  });

  it('allows dual tutor+student on both portals', () => {
    const both: AccountPortals = { orgAdmin: false, parent: false, student: true, tutor: true };
    expect(canAccessLoginPortal(both, 'tutor')).toBe(true);
    expect(canAccessLoginPortal(both, 'student')).toBe(true);
  });
});

describe('loginErrorKeyForPortalMismatch', () => {
  it('returns tutor-specific message when a tutor tries the student portal', () => {
    expect(
      loginErrorKeyForPortalMismatch('student', {
        orgAdmin: false,
        parent: false,
        student: false,
        tutor: true,
      }),
    ).toBe('login.noStudentFound');
  });

  it('returns student-specific message when a student tries the tutor portal', () => {
    expect(
      loginErrorKeyForPortalMismatch('tutor', {
        orgAdmin: false,
        parent: false,
        student: true,
        tutor: false,
      }),
    ).toBe('login.noTutorFound');
  });
});

describe('profileQualifiesAsTutor', () => {
  const ghostProfile = {
    id: 'user-1',
    organization_id: null,
    subscription_status: null,
    manual_subscription_exempt: false,
  };

  it('treats student + bare profiles row as student-only (not tutor)', () => {
    expect(profileQualifiesAsTutor(ghostProfile, true)).toBe(false);
  });

  it('treats solo tutor signup profile as tutor when no student row', () => {
    expect(profileQualifiesAsTutor(ghostProfile, false)).toBe(true);
  });

  it('treats org-linked profile as tutor even with a student row', () => {
    expect(
      profileQualifiesAsTutor({ ...ghostProfile, organization_id: 'org-1' }, true),
    ).toBe(true);
  });

  it('treats subscribed profile as tutor', () => {
    expect(
      profileQualifiesAsTutor({ ...ghostProfile, subscription_status: 'active' }, true),
    ).toBe(true);
  });
});
