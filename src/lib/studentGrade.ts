/** Stored student.grade for years 1–12, matching org/school UI (`"5 klasė"`). */
export function normalizeStudentGrade1to12(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  // Accept "12", "12 klasė", corrupted "12 klas?" / "12 klas??", and ASCII "12 klase".
  const match = trimmed.match(/^(\d{1,2})(?:\s*klas(?:ė|e|\?+|\uFFFD+)?)?$/i);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isInteger(n) || n < 1 || n > 12) return null;
  return `${n} klasė`;
}

export function studentGradeSelectValue(grade: string): string {
  const normalized = normalizeStudentGrade1to12(grade);
  return normalized ? normalized.replace(/\s*klasė$/i, '').trim() : '';
}

/** Display helper: repair corrupted 1–12 grades, otherwise keep free-text (Studentas / Kita). */
export function displayStudentGrade(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return normalizeStudentGrade1to12(trimmed) ?? trimmed;
}

const PRO_KLASE_GRADE_SELECT_ITEMS = new Set([
  'unset',
  ...Array.from({ length: 12 }, (_, index) => `${index + 1} klasė`),
  'Studentas',
  'Kita',
]);

/** Radix Select throws if `value` is not in the item list (corrupted "klas?" grades). */
export function proKlaseGradeSelectValue(grade: unknown): string {
  const normalized = normalizeStudentGrade1to12(grade);
  if (normalized) return normalized;
  const raw = String(grade ?? '').trim();
  if (!raw) return 'unset';
  if (PRO_KLASE_GRADE_SELECT_ITEMS.has(raw)) return raw;
  return 'Kita';
}
