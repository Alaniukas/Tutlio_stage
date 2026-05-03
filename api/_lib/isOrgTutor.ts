/** True when the tutor belongs to an organization (must not receive payment-sensitive emails). */
export function isOrgTutor(organizationId: string | null | undefined): boolean {
  return organizationId != null && organizationId !== '';
}
