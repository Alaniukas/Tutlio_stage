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

function normalizeStudentIdentityName(fullName: string | null | undefined): string {
  return String(fullName ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Group key for multi-tutor rows of the same child in org admin lists.
 * Name is part of the key so siblings who share a parent login or payer email
 * stay separate (Laisvi vaikai: Vitkutė Etmė vs Kajus, same linked_user_id).
 */
export function orgStudentIdentityGroupKey(student: OrgStudentIdentityRow): string {
  const name = normalizeStudentIdentityName(student.full_name);
  if (student.linked_user_id) return `u:${student.linked_user_id}:${name}`;
  const email = String(student.email ?? '').trim().toLowerCase();
  if (email) {
    const org = student.organization_id ?? 'no-org';
    return `e:${org}:${email}:${name}`;
  }
  return `s:${student.id}`;
}

export function sameOrgStudentIdentity(
  a: OrgStudentIdentityRow,
  b: OrgStudentIdentityRow,
): boolean {
  return orgStudentIdentityGroupKey(a) === orgStudentIdentityGroupKey(b);
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
