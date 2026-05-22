import { describe, expect, it } from 'vitest';
import { canAccessLoginPortal, loginErrorKeyForPortalMismatch, type AccountPortals } from '../../src/lib/account-portal';

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
