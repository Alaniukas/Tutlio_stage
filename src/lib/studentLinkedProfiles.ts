/** Typed row returned by `get_student_profiles` for student/parent portals. */
export type StudentLinkedProfileRow = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  age?: number | null;
  grade?: string | null;
  tutor_id?: string | null;
  tutor_full_name?: string | null;
  tutor_email?: string | null;
  payment_payer?: string | null;
  payer_name?: string | null;
  payer_email?: string | null;
  invite_code?: string | null;
  tutor_cancellation_hours?: number | null;
  tutor_cancellation_fee_percent?: number | null;
  tutor_min_booking_hours?: number | null;
  tutor_break_between_lessons?: number | null;
  payment_model?: string | null;
  payment_override_active?: boolean | null;
  credit_balance?: number | null;
  organization_id?: string | null;
  organization_entity_type?: string | null;
  tutor_organization_entity_type?: string | null;
  tutor_organization_slug?: string | null;
};

/** All student row ids for one auth user (multi-tutor orgs may have several). */
export function linkedStudentProfileIds(
  profiles: StudentLinkedProfileRow[] | null | undefined,
): string[] {
  const ids = new Set<string>();
  for (const row of profiles ?? []) {
    if (row?.id) ids.add(row.id);
  }
  return [...ids];
}

/** Active profile from localStorage preference, else first RPC row. */
export function pickActiveStudentProfile<T extends StudentLinkedProfileRow>(
  profiles: T[] | null | undefined,
  preferredId: string | null | undefined,
): T | null {
  if (!profiles?.length) return null;
  if (preferredId) {
    const picked = profiles.find((row) => row.id === preferredId);
    if (picked) return picked;
  }
  return profiles[0];
}

/** Dedupe session rows that can appear under multiple linked student ids. */
export function dedupeSessionsById<T extends { id: string }>(rows: T[]): T[] {
  const byId = new Map<string, T>();
  for (const row of rows) {
    if (row?.id) byId.set(row.id, row);
  }
  return [...byId.values()];
}
