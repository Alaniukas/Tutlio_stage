/** Minimal row from `get_student_profiles` for portal session scoping. */
export type StudentLinkedProfileRow = {
  id: string;
  tutor_id?: string | null;
  full_name?: string | null;
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
