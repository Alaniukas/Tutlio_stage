import { describe, expect, it } from 'vitest';
import { canDeleteOrgSession } from '@/lib/orgSessionDeletion';

describe('organization administrator lesson deletion', () => {
  it('allows an editor to delete an individual lesson regardless of its status', () => {
    expect(canDeleteOrgSession({ classGroupId: null, isGroupLesson: false }, true)).toBe(true);
  });

  it('does not expose hard deletion to a read-only administrator', () => {
    expect(canDeleteOrgSession({ classGroupId: null, isGroupLesson: false }, false)).toBe(false);
  });

  it('allows editors to clean up cancelled class-group and legacy group lessons', () => {
    expect(canDeleteOrgSession({ classGroupId: 'group', isGroupLesson: false }, true)).toBe(true);
    expect(canDeleteOrgSession({ classGroupId: null, isGroupLesson: true }, true)).toBe(true);
    expect(canDeleteOrgSession({ classGroupId: 'group', isGroupLesson: true }, false)).toBe(false);
  });

  it('requires a selected lesson', () => {
    expect(canDeleteOrgSession(null, true)).toBe(false);
    expect(canDeleteOrgSession(undefined, true)).toBe(false);
  });
});
