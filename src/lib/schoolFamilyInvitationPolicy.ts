/** Private school portals use verified family activation, never a legacy student code. */
export function schoolFamilyInvitationsRequired(
  entityType: string | null | undefined,
  features: Record<string, unknown> | null | undefined,
): boolean {
  return entityType === 'school' && features?.school_family_portal === true;
}
