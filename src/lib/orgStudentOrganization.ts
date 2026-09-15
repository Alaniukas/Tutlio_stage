/** Stamp the tutor's organization on a new student row created from the tutor portal. */
export function orgTutorStudentInsertFields(args: {
  tutorId: string;
  organizationId?: string | null;
}): { tutor_id: string; organization_id?: string } {
  const organizationId = typeof args.organizationId === 'string' ? args.organizationId.trim() : '';
  if (!organizationId) return { tutor_id: args.tutorId };
  return { tutor_id: args.tutorId, organization_id: organizationId };
}

/** Live org-admin student: own organization_id, or paired with a tutor in this org. */
export function studentBelongsToOrganization(args: {
  studentOrganizationId?: string | null;
  tutorOrganizationId?: string | null;
  organizationId: string;
  detachedAt?: string | null;
}): boolean {
  if (args.detachedAt) return false;
  if (!args.organizationId) return false;
  return args.studentOrganizationId === args.organizationId
    || args.tutorOrganizationId === args.organizationId;
}
