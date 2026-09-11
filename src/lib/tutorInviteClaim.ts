export type TutorInviteClaimRow = {
  id: string;
  organization_id: string;
  used: boolean;
  used_by_profile_id: string | null;
  invitee_email?: string | null;
};

export function normalizeInviteEmail(email?: string | null): string {
  return String(email || '').trim().toLowerCase();
}

export function inviteEmailsMatch(a?: string | null, b?: string | null): boolean {
  const left = normalizeInviteEmail(a);
  const right = normalizeInviteEmail(b);
  return Boolean(left && right && left === right);
}

/**
 * Whether claiming this token should attach the current user.
 * Used-but-unlinked invites (legacy) are attached when the email matches,
 * or when the invite has no email and the caller holds the token.
 */
export function tutorInviteClaimDecision(
  invite: TutorInviteClaimRow,
  user: { id: string; email?: string | null },
): { conflict: boolean; shouldLink: boolean } {
  if (invite.used && invite.used_by_profile_id && invite.used_by_profile_id !== user.id) {
    return { conflict: true, shouldLink: false };
  }
  if (
    invite.used
    && !invite.used_by_profile_id
    && invite.invitee_email
    && user.email
    && !inviteEmailsMatch(invite.invitee_email, user.email)
  ) {
    return { conflict: true, shouldLink: false };
  }
  return {
    conflict: false,
    shouldLink: !invite.used || !invite.used_by_profile_id,
  };
}

export type OrgTutorInviteLink = {
  used_by_profile_id?: string | null;
  used?: boolean | null;
  invitee_email?: string | null;
};

/** Pending invites that should not stay "waiting" once this tutor is in the org. */
export function unusedInviteIdsForJoinedTutor(
  invites: Array<{ id: string; used?: boolean | null; invitee_email?: string | null; organization_id?: string }>,
  opts: { organizationId: string; email?: string | null; excludeId?: string },
): string[] {
  const email = normalizeInviteEmail(opts.email);
  if (!email) return [];
  return invites
    .filter((inv) => {
      if (inv.id === opts.excludeId) return false;
      if (inv.used) return false;
      if (inv.organization_id && inv.organization_id !== opts.organizationId) return false;
      return inviteEmailsMatch(inv.invitee_email, email);
    })
    .map((inv) => inv.id);
}
