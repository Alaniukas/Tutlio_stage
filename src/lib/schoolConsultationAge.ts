export function ageFromBirthDate(iso: string | null | undefined, at: Date = new Date()): number | null {
  const raw = String(iso || '').trim();
  if (!raw) return null;
  const birth = new Date(raw);
  if (Number.isNaN(birth.getTime())) return null;
  let age = at.getFullYear() - birth.getFullYear();
  const m = at.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < birth.getDate())) age -= 1;
  return age;
}

/** Parents act for children under 12; students 12+ may confirm themselves. */
export function canActWithoutParent(childBirthDate: string | null | undefined, at: Date = new Date()): boolean {
  const age = ageFromBirthDate(childBirthDate, at);
  if (age === null) return false;
  return age >= 12;
}
