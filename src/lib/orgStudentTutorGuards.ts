/** Normalize email for org tutor / student conflict checks. */
export function normalizeEmail(email: string | null | undefined): string {
  return String(email || '').trim().toLowerCase();
}

/**
 * Org student row must not use an org tutor's email (creates duplicate portal + hides tutor in admin UI).
 */
export function findOrgTutorEmailConflict(
  studentEmail: string,
  tutors: Array<{ id: string; email?: string | null; full_name?: string | null }>,
): { tutorId: string; tutorName: string } | null {
  const normalized = normalizeEmail(studentEmail);
  if (!normalized.includes('@')) return null;
  for (const tutor of tutors) {
    if (normalizeEmail(tutor.email) === normalized) {
      return {
        tutorId: tutor.id,
        tutorName: String(tutor.full_name || tutor.email || '').trim() || normalized,
      };
    }
  }
  return null;
}

/** Student cannot be linked to their own tutor profile (self-referential row). */
export function isSelfStudentTutorLink(
  tutorId: string | null | undefined,
  linkedUserId: string | null | undefined,
): boolean {
  return Boolean(tutorId && linkedUserId && tutorId === linkedUserId);
}
