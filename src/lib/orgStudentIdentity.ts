import { displayStudentGrade } from './studentGrade.js';
import { isPendingChildName } from './pendingChildName.js';

/** Minimal student row fields for org-wide identity grouping / picker dedup. */
export type OrgStudentIdentityRow = {
  id: string;
  tutor_id?: string | null;
  linked_user_id?: string | null;
  email?: string | null;
  organization_id?: string | null;
  full_name?: string | null;
  grade?: string | null;
  payer_email?: string | null;
};

/** Extra contact fields for org admin student pickers (schedule, waitlist, …). */
export type OrgStudentPickerRow = OrgStudentIdentityRow & {
  payer_name?: string | null;
  payer_email?: string | null;
};

export const ORG_STUDENT_PICKER_SELECT =
  'id, full_name, email, tutor_id, grade, linked_user_id, organization_id, payer_name, payer_email';

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
  const payerEmail = String(student.payer_email ?? '').trim().toLowerCase();
  if (payerEmail && name) {
    const org = student.organization_id ?? 'no-org';
    return `p:${org}:${payerEmail}:${name}`;
  }
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

/** Primary list / picker title — real name when set; payer hint when still pending registration. */
export function orgStudentDisplayName(student: OrgStudentPickerRow): string {
  const fullName = String(student.full_name ?? '').trim();
  if (!isPendingChildName(fullName)) {
    return fullName || '—';
  }
  const payerName = String(student.payer_name ?? '').trim();
  const payerEmail = String(student.payer_email ?? '').trim();
  const hint = payerName || payerEmail;
  if (hint && hint.toLowerCase() !== fullName.toLowerCase()) {
    const pendingLabel = fullName || '—';
    return `${pendingLabel} · ${hint}`;
  }
  return fullName || '—';
}

export function formatOrgStudentPickerLabel(student: OrgStudentPickerRow): string {
  const base = orgStudentDisplayName(student);
  const gradeLabel = displayStudentGrade(student.grade);
  return gradeLabel ? `${base} (${gradeLabel})` : base;
}

export function matchesOrgStudentPickerSearch(
  student: OrgStudentPickerRow,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    student.full_name,
    student.email,
    student.payer_name,
    student.payer_email,
    student.grade,
    displayStudentGrade(student.grade),
    orgStudentDisplayName(student),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return haystack.includes(q);
}

export function formatStudentPickerLabel(
  fullName: string | null | undefined,
  grade: string | null | undefined,
): string {
  return formatOrgStudentPickerLabel({ id: '', full_name: fullName, grade });
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
