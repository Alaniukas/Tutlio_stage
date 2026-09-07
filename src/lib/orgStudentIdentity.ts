import { displayStudentGrade } from './studentGrade.js';

/** Minimal student row fields for org-wide identity grouping / picker dedup. */
export type OrgStudentIdentityRow = {
  id: string;
  tutor_id?: string | null;
  linked_user_id?: string | null;
  email?: string | null;
  organization_id?: string | null;
  full_name?: string | null;
  grade?: string | null;
};

/** Group key for multi-tutor student rows in org admin lists. */
export function orgStudentIdentityGroupKey(student: OrgStudentIdentityRow): string {
  if (student.linked_user_id) return `u:${student.linked_user_id}`;
  const email = String(student.email ?? '').trim().toLowerCase();
  if (email) {
    const org = student.organization_id ?? 'no-org';
    return `e:${org}:${email}`;
  }
  return `s:${student.id}`;
}

/**
 * One picker row per student identity for org schedule / waitlist.
 * When multiple rows share an identity, prefer the row already paired with tutorId.
 */
export function pickStudentsForOrgTutorPicker<T extends OrgStudentIdentityRow>(
  students: T[],
  tutorId: string | null | undefined,
): T[] {
  const byIdentity = new Map<string, T>();
  for (const row of students) {
    const key = orgStudentIdentityGroupKey(row);
    const existing = byIdentity.get(key);
    if (!existing) {
      byIdentity.set(key, row);
      continue;
    }
    if (tutorId && row.tutor_id === tutorId && existing.tutor_id !== tutorId) {
      byIdentity.set(key, row);
    }
  }
  return Array.from(byIdentity.values());
}

export function formatStudentPickerLabel(
  fullName: string | null | undefined,
  grade: string | null | undefined,
): string {
  const name = String(fullName ?? '').trim() || '—';
  const gradeLabel = displayStudentGrade(grade);
  return gradeLabel ? `${name} (${gradeLabel})` : name;
}

/** Student display name with optional grade suffix for calendar event titles. */
export function calendarStudentTitlePart(
  fullName: string | null | undefined,
  grade: string | null | undefined,
): string {
  const name = String(fullName ?? '').trim();
  if (!name) return '';
  const gradeLabel = displayStudentGrade(grade);
  return gradeLabel ? `${name} · ${gradeLabel}` : name;
}
