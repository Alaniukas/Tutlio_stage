import {
  normalizeOrgStudentIdentityName,
  sameOrgStudentIdentity,
  type OrgStudentIdentityRow,
} from './orgStudentIdentity.js';

export type OrgStudentContactRow = OrgStudentIdentityRow & {
  id: string;
  detached_at?: string | null;
};

/** Shared placeholder addresses must never be reused across different students. */
export const SHARED_PLACEHOLDER_STUDENT_EMAILS = new Set([
  'neturipasto@gmail.com',
]);

export type OrgStudentEmailConflictCode =
  | 'student_email_taken'
  | 'placeholder_email_taken'
  | 'auth_email_other_student';

export type OrgStudentEmailConflict = {
  code: OrgStudentEmailConflictCode;
  existingStudentId?: string;
  existingStudentName: string;
  email: string;
};

export function studentEmailConflictI18nKey(code: OrgStudentEmailConflictCode): string {
  switch (code) {
    case 'placeholder_email_taken':
      return 'compStu.studentPlaceholderEmailTaken';
    case 'auth_email_other_student':
      return 'compStu.studentEmailAuthConflict';
    default:
      return 'compStu.studentEmailAlreadyUsed';
  }
}

export function normalizeContactEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isSharedPlaceholderStudentEmail(email: string): boolean {
  return SHARED_PLACEHOLDER_STUDENT_EMAILS.has(normalizeContactEmail(email));
}

export function findStudentEmailConflictAmongRows(
  input: {
    organizationId: string;
    fullName: string;
    email: string;
    excludeStudentIds?: string[];
  },
  rows: OrgStudentContactRow[],
): OrgStudentEmailConflict | null {
  const email = normalizeContactEmail(input.email);
  if (!email.includes('@')) return null;

  const exclude = new Set(input.excludeStudentIds || []);
  const incoming: OrgStudentContactRow = {
    id: 'incoming',
    organization_id: input.organizationId,
    full_name: input.fullName,
    email,
  };

  for (const row of rows) {
    if (exclude.has(row.id)) continue;
    const rowEmail = normalizeContactEmail(row.email || '');
    if (rowEmail !== email) continue;

    if (isSharedPlaceholderStudentEmail(email)) {
      return {
        code: 'placeholder_email_taken',
        existingStudentId: row.id,
        existingStudentName: String(row.full_name || '').trim() || '—',
        email,
      };
    }

    if (row.detached_at) continue;

    if (!sameOrgStudentIdentity(incoming, row)) {
      return {
        code: 'student_email_taken',
        existingStudentId: row.id,
        existingStudentName: String(row.full_name || '').trim() || '—',
        email,
      };
    }
  }

  return null;
}

export function findAuthEmailStudentConflict(
  input: { organizationId: string; fullName: string; excludeStudentIds?: string[] },
  auth: { id: string; studentId?: string | null; fullName?: string | null; role?: string | null },
  orgStudents: OrgStudentContactRow[],
): OrgStudentEmailConflict | null {
  if (auth.role === 'parent') return null;

  const exclude = new Set(input.excludeStudentIds || []);
  const email = '';
  const incomingName = normalizeOrgStudentIdentityName(input.fullName);

  const linkedRows = orgStudents.filter((row) => row.linked_user_id === auth.id);
  for (const row of linkedRows) {
    if (exclude.has(row.id)) continue;
    if (!sameOrgStudentIdentity(
      { id: 'incoming', organization_id: input.organizationId, full_name: input.fullName, email: row.email },
      row,
    )) {
      return {
        code: 'auth_email_other_student',
        existingStudentId: row.id,
        existingStudentName: String(row.full_name || auth.fullName || '').trim() || '—',
        email,
      };
    }
    return null;
  }

  const metaStudentId = String(auth.studentId || '').trim();
  if (metaStudentId && !exclude.has(metaStudentId)) {
    const owner = orgStudents.find((row) => row.id === metaStudentId);
    if (owner) {
      if (normalizeOrgStudentIdentityName(owner.full_name) === incomingName
        && owner.organization_id === input.organizationId) {
        return null;
      }
      return {
        code: 'auth_email_other_student',
        existingStudentId: owner.id,
        existingStudentName: String(owner.full_name || auth.fullName || '').trim() || '—',
        email,
      };
    }
  }

  if (auth.role === 'student' || metaStudentId) {
    return {
      code: 'auth_email_other_student',
      existingStudentName: String(auth.fullName || '').trim() || '—',
      email,
    };
  }

  return null;
}
