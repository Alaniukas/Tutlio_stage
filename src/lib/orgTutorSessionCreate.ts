/** Org feature `org_tutor_availability_only`: tutors may only manage availability, not create lessons. */
export function orgTutorAvailabilityOnly(
  features: Record<string, unknown> | null | undefined,
): boolean {
  return features?.org_tutor_availability_only === true;
}

export function orgTutorCanCreateSessions(
  features: Record<string, unknown> | null | undefined,
): boolean {
  return !orgTutorAvailabilityOnly(features);
}
