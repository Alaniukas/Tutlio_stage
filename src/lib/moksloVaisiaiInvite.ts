export type OrgStudentInviteTarget = 'student' | 'both' | 'parent' | 'provision';

export function shouldProvisionAccountsOnCreate(inviteTarget: OrgStudentInviteTarget): boolean {
  return inviteTarget === 'provision';
}

export function shouldSendStudentInviteEmail(inviteTarget: OrgStudentInviteTarget): boolean {
  return inviteTarget === 'student' || inviteTarget === 'both';
}

export function shouldSendParentInviteOnCreate(inviteTarget: OrgStudentInviteTarget): boolean {
  return inviteTarget === 'both' || inviteTarget === 'parent';
}
