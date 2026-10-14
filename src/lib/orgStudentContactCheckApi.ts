import { resolveAccessToken } from './authSession.js';
import type { OrgStudentEmailConflictCode } from './orgStudentContactConflict.js';

export type OrgStudentContactCheckResult =
  | { ok: true }
  | { ok: false; unavailable: true }
  | {
      ok: false;
      unavailable?: false;
      code: OrgStudentEmailConflictCode;
      email: string;
      existingStudentName: string;
      existingStudentId?: string;
    };

export async function checkOrgStudentEmailAvailable(input: {
  organizationId: string;
  fullName: string;
  studentEmail: string;
  excludeStudentIds?: string[];
}): Promise<OrgStudentContactCheckResult> {
  const email = input.studentEmail.trim();
  if (!email.includes('@')) return { ok: true };

  try {
    const token = await resolveAccessToken();
    if (!token) return { ok: false, unavailable: true };

    const response = await fetch('/api/org-student-contact-check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        organizationId: input.organizationId,
        fullName: input.fullName,
        studentEmail: email,
        excludeStudentIds: input.excludeStudentIds,
      }),
    });

    if (response.ok) return { ok: true };

    const json = await response.json().catch(() => ({})) as {
      code?: OrgStudentEmailConflictCode;
      email?: string;
      existingStudentName?: string;
      existingStudentId?: string;
    };

    if (response.status === 409 && json.code) {
      return {
        ok: false,
        code: json.code,
        email: json.email || email,
        existingStudentName: json.existingStudentName || '—',
        existingStudentId: json.existingStudentId,
      };
    }

    return { ok: false, unavailable: true };
  } catch {
    return { ok: false, unavailable: true };
  }
}
