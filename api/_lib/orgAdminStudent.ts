import type { SupabaseClient } from '@supabase/supabase-js';
import { studentBelongsToOrganization } from '../../src/lib/orgStudentOrganization.js';

type LiveStudentRow = {
  id: string;
  tutor_id: string | null;
  organization_id: string | null;
  detached_at: string | null;
};

/**
 * Org admin student lookup that matches the Klientai list: organization_id on
 * the row, or a live pairing with a tutor in this organization. Missing
 * organization_id is filled from the tutor so pooled-package RPCs can proceed.
 */
export async function resolveLiveOrgStudent(
  db: SupabaseClient,
  studentId: string,
  organizationId: string,
): Promise<{ id: string; tutor_id: string | null } | null> {
  const studentRes = await db
    .from('students')
    .select('id, tutor_id, organization_id, detached_at')
    .eq('id', studentId)
    .is('detached_at', null)
    .maybeSingle();
  const student = studentRes.data as LiveStudentRow | null;
  if (studentRes.error || !student) return null;

  let tutorOrganizationId: string | null = null;
  if (student.tutor_id) {
    const tutorRes = await db.from('profiles').select('organization_id').eq('id', student.tutor_id).maybeSingle();
    tutorOrganizationId = (tutorRes.data as { organization_id?: string | null } | null)?.organization_id ?? null;
  }

  if (!studentBelongsToOrganization({
    studentOrganizationId: student.organization_id,
    tutorOrganizationId,
    organizationId,
  })) {
    return null;
  }

  if (!student.organization_id && tutorOrganizationId === organizationId) {
    const patched = await db
      .from('students')
      .update({ organization_id: organizationId })
      .eq('id', student.id)
      .is('detached_at', null);
    if (patched.error) throw new Error(patched.error.message);
  }

  return { id: student.id, tutor_id: student.tutor_id };
}
