import { describe, expect, it } from 'vitest';
import { orgTutorStudentInsertFields, studentBelongsToOrganization } from '../../src/lib/orgStudentOrganization';

describe('org tutor student organization', () => {
  it('stamps the tutor organization on insert and skips solo tutors', () => {
    expect(orgTutorStudentInsertFields({ tutorId: 't1', organizationId: 'org-1' })).toEqual({
      tutor_id: 't1',
      organization_id: 'org-1',
    });
    expect(orgTutorStudentInsertFields({ tutorId: 't1', organizationId: '  ' })).toEqual({ tutor_id: 't1' });
    expect(orgTutorStudentInsertFields({ tutorId: 't1' })).toEqual({ tutor_id: 't1' });
  });

  it('treats live tutor pairings as org students even when organization_id is missing', () => {
    expect(studentBelongsToOrganization({
      studentOrganizationId: null,
      tutorOrganizationId: 'org-1',
      organizationId: 'org-1',
    })).toBe(true);
    expect(studentBelongsToOrganization({
      studentOrganizationId: 'org-1',
      tutorOrganizationId: null,
      organizationId: 'org-1',
    })).toBe(true);
    expect(studentBelongsToOrganization({
      studentOrganizationId: null,
      tutorOrganizationId: 'org-1',
      organizationId: 'org-1',
      detachedAt: '2026-09-01',
    })).toBe(false);
    expect(studentBelongsToOrganization({
      studentOrganizationId: null,
      tutorOrganizationId: 'other',
      organizationId: 'org-1',
    })).toBe(false);
  });
});
