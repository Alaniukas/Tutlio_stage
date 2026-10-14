import { describe, expect, it } from 'vitest';
import {
  findStudentEmailConflictAmongRows,
  findAuthEmailStudentConflict,
  isSharedPlaceholderStudentEmail,
} from '../../src/lib/orgStudentContactConflict';

const orgId = '3422031d-6e21-424d-980b-35a9c6d7b8f1';

describe('orgStudentContactConflict', () => {
  it('keeps another organization’s Auth account name private', () => {
    const conflict = findAuthEmailStudentConflict(
      { organizationId: orgId, fullName: 'New Child' },
      { id: 'foreign-auth', studentId: 'foreign-child', fullName: 'Private Name', role: 'student' },
      [],
    );
    expect(conflict).toMatchObject({ code: 'auth_email_other_student', existingStudentName: '—' });
    expect(conflict?.existingStudentId).toBeUndefined();
  });

  it('allows an existing Auth owner to retry provision for the same child in this organization', () => {
    expect(findAuthEmailStudentConflict(
      { organizationId: orgId, fullName: 'Existing Child', excludeStudentIds: ['existing-child'] },
      { id: 'auth-user', studentId: 'existing-child', role: 'student' },
      [{ id: 'existing-child', organization_id: orgId, full_name: 'Existing Child' }],
    )).toBeNull();
    expect(findAuthEmailStudentConflict(
      { organizationId: orgId, fullName: 'Existing Child', excludeStudentIds: ['existing-child'] },
      { id: 'auth-user', role: 'student' },
      [{ id: 'existing-child', organization_id: orgId, full_name: 'Existing Child', linked_user_id: 'auth-user' }],
    )).toBeNull();
  });

  it('keeps an Auth account owned by another child blocked during a provision retry', () => {
    expect(findAuthEmailStudentConflict(
      { organizationId: orgId, fullName: 'New Child', excludeStudentIds: ['new-child'] },
      { id: 'auth-user', studentId: 'other-child', role: 'student' },
      [{ id: 'other-child', organization_id: orgId, full_name: 'Other Child' }],
    )?.code).toBe('auth_email_other_student');
    expect(findAuthEmailStudentConflict(
      { organizationId: orgId, fullName: 'New Child', excludeStudentIds: ['other-child'] },
      { id: 'auth-user', studentId: 'other-child', role: 'student' },
      [{ id: 'other-child', organization_id: 'another-org', full_name: 'Other Child' }],
    )?.code).toBe('auth_email_other_student');
  });
  it('flags shared placeholder reuse across different children', () => {
    expect(isSharedPlaceholderStudentEmail('neturipasto@gmail.com')).toBe(true);
    const conflict = findStudentEmailConflictAmongRows(
      {
        organizationId: orgId,
        fullName: 'Justinas Viso',
        email: 'neturipasto@gmail.com',
      },
      [
        {
          id: 'other',
          organization_id: orgId,
          full_name: 'Denas Example',
          email: 'neturipasto@gmail.com',
        },
      ],
    );
    expect(conflict?.code).toBe('placeholder_email_taken');
    expect(conflict?.existingStudentName).toBe('Denas Example');
  });

  it('allows same email for same child identity (multi-tutor rows)', () => {
    const conflict = findStudentEmailConflictAmongRows(
      {
        organizationId: orgId,
        fullName: 'Justinas Viso',
        email: 'visojusti@gmail.com',
      },
      [
        {
          id: 'a',
          organization_id: orgId,
          full_name: 'Justinas Viso',
          email: 'visojusti@gmail.com',
          payer_email: 'parent@example.com',
        },
      ],
    );
    expect(conflict).toBeNull();
  });

  it('blocks duplicate email for a different child', () => {
    const conflict = findStudentEmailConflictAmongRows(
      {
        organizationId: orgId,
        fullName: 'New Child',
        email: 'visojusti@gmail.com',
      },
      [
        {
          id: 'existing',
          organization_id: orgId,
          full_name: 'Justinas Viso',
          email: 'visojusti@gmail.com',
        },
      ],
    );
    expect(conflict?.code).toBe('student_email_taken');
  });

  it('ignores detached rows for normal emails', () => {
    const conflict = findStudentEmailConflictAmongRows(
      {
        organizationId: orgId,
        fullName: 'New Child',
        email: 'reuse@example.com',
      },
      [
        {
          id: 'old',
          organization_id: orgId,
          full_name: 'Someone Else',
          email: 'reuse@example.com',
          detached_at: '2026-01-01T00:00:00Z',
        },
      ],
    );
    expect(conflict).toBeNull();
  });
});
