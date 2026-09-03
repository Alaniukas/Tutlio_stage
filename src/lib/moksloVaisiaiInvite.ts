export type OrgStudentInviteTarget = 'student' | 'both' | 'parent';

export function shouldSendStudentInviteEmail(inviteTarget: OrgStudentInviteTarget): boolean {
  return inviteTarget !== 'parent';
}

export function shouldSendParentInviteOnCreate(inviteTarget: OrgStudentInviteTarget): boolean {
  return inviteTarget === 'both' || inviteTarget === 'parent';
}
