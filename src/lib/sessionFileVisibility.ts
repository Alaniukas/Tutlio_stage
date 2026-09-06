/** Parent/student homework uploads (`api/school-homework`) use this prefix in the session folder. */
export const HOMEWORK_FILE_PREFIX = 'nd-';

export function isHomeworkSubmissionFile(name: string): boolean {
  return String(name || '').startsWith(HOMEWORK_FILE_PREFIX);
}

/** `nd-austeja-mockute-Atsakymai.pdf` → `austeja-mockute-Atsakymai.pdf` for the teacher list. */
export function homeworkSubmissionDisplayName(fileName: string): string {
  const raw = String(fileName || '');
  if (!raw.toLowerCase().startsWith(HOMEWORK_FILE_PREFIX)) return raw;
  return raw.slice(HOMEWORK_FILE_PREFIX.length) || raw;
}

/**
 * Teacher materials (no `nd-` prefix) are shared across parallel group-lesson folders.
 * Homework submissions live in the submitting child's session folder and must not
 * be shown to classmates — only that child (and the teacher, who lists every folder).
 */
export function studentMaySeeGroupFile(
  fileName: string,
  folderId: string,
  studentSessionId: string,
): boolean {
  if (!isHomeworkSubmissionFile(fileName)) return true;
  return folderId === studentSessionId;
}
