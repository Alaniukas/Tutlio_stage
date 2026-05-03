/**
 * Copy sorted A-Z by full_name (Lithuanian collation, case-insensitive).
 * Use for student dropdowns / checklists when picking who joins a lesson.
 */
export function sortStudentsByFullName<T extends { full_name?: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    (a.full_name || '').localeCompare(b.full_name || '', 'lt', { sensitivity: 'base', numeric: true }),
  );
}
