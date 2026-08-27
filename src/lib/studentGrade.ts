/** Stored student.grade for years 1–12, matching org/school UI (`"5 klasė"`). */
export function normalizeStudentGrade1to12(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  // Accept "12", "12 klasė", corrupted "12 klas??", and ASCII "12 klase".
  const match = trimmed.match(/^(\d{1,2})(?:\s*klas(?:ė|e|\?\?)?)?$/i);
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
