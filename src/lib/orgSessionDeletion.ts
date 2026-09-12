export type OrgSessionDeletionCandidate = {
  classGroupId?: string | null;
  isGroupLesson?: boolean | null;
};

/** Hard deletion is an admin-only escape hatch for individual lesson rows. */
export function canDeleteIndividualOrgSession(
  session: OrgSessionDeletionCandidate | null | undefined,
  hasEditPermission: boolean,
): boolean {
  return Boolean(
    hasEditPermission
      && session
      && !session.classGroupId
      && session.isGroupLesson !== true,
  );
}
