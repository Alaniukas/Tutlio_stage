/** Stored student.grade for years 1–12 (`"5 klasė"`). Mirror of src/lib/studentGrade.ts for API bundles. */
export function normalizeStudentGrade1to12(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2})(?:\s*klas(?:ė|e|\?+|\uFFFD+)?)?$/i);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isInteger(n) || n < 1 || n > 12) return null;
  return `${n} klasė`;
}
