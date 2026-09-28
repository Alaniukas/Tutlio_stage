export type OrgSessionDeletionCandidate = {
  classGroupId?: string | null;
  isGroupLesson?: boolean | null;
};

/** Editors can remove lesson rows, including cancelled and group lessons. */
export function canDeleteOrgSession(
  session: OrgSessionDeletionCandidate | null | undefined,
  hasEditPermission: boolean,
): boolean {
  return Boolean(
    hasEditPermission && session,
  );
}
