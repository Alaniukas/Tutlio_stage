import { describe, expect, it } from 'vitest';
import {
  tutorInviteClaimDecision,
  unusedInviteIdsForJoinedTutor,
} from '../../src/lib/tutorInviteClaim';

const unused = {
  id: 'inv-new',
  organization_id: 'org-1',
  used: false,
  used_by_profile_id: null,
  invitee_email: 'tutor@org.lt',
};

describe('tutorInviteClaimDecision', () => {
  it('links an unused invite', () => {
    expect(tutorInviteClaimDecision(unused, { id: 'u1', email: 'tutor@org.lt' })).toEqual({
      conflict: false,
      shouldLink: true,
    });
  });

  it('backfills a used invite that never stored used_by_profile_id', () => {
    expect(
      tutorInviteClaimDecision(
        { ...unused, id: 'inv-old', used: true },
        { id: 'u1', email: 'tutor@org.lt' },
      ),
    ).toEqual({ conflict: false, shouldLink: true });
  });

  it('is a no-op when the same user already owns the invite', () => {
    expect(
      tutorInviteClaimDecision(
        { ...unused, used: true, used_by_profile_id: 'u1' },
        { id: 'u1', email: 'tutor@org.lt' },
      ),
    ).toEqual({ conflict: false, shouldLink: false });
  });

  it('rejects a token already attached to someone else', () => {
    expect(
      tutorInviteClaimDecision(
        { ...unused, used: true, used_by_profile_id: 'other' },
        { id: 'u1', email: 'tutor@org.lt' },
      ),
    ).toEqual({ conflict: true, shouldLink: false });
  });

  it('rejects a used-unlinked invite when the email does not match', () => {
    expect(
      tutorInviteClaimDecision(
        { ...unused, used: true, invitee_email: 'other@org.lt' },
        { id: 'u1', email: 'tutor@org.lt' },
      ),
    ).toEqual({ conflict: true, shouldLink: false });
  });
});

describe('unusedInviteIdsForJoinedTutor', () => {
  it('closes later pending invites for the same email in the org', () => {
    expect(
      unusedInviteIdsForJoinedTutor(
        [
          unused,
          { id: 'inv-later', used: false, invitee_email: 'tutor@org.lt', organization_id: 'org-1' },
          { id: 'inv-other', used: false, invitee_email: 'else@org.lt', organization_id: 'org-1' },
        ],
        { organizationId: 'org-1', email: 'tutor@org.lt', excludeId: unused.id },
      ),
    ).toEqual(['inv-later']);
  });
});
