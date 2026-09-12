import { describe, expect, it } from 'vitest';
import { canDeleteIndividualOrgSession } from '@/lib/orgSessionDeletion';

describe('organization administrator lesson deletion', () => {
  it('allows an editor to delete an individual lesson regardless of its status', () => {
    expect(canDeleteIndividualOrgSession({ classGroupId: null, isGroupLesson: false }, true)).toBe(true);
  });

  it('does not expose hard deletion to a read-only administrator', () => {
    expect(canDeleteIndividualOrgSession({ classGroupId: null, isGroupLesson: false }, false)).toBe(false);
  });

  it('does not hard-delete class-group or legacy group lesson rows', () => {
    expect(canDeleteIndividualOrgSession({ classGroupId: 'group', isGroupLesson: false }, true)).toBe(false);
    expect(canDeleteIndividualOrgSession({ classGroupId: null, isGroupLesson: true }, true)).toBe(false);
  });
});
