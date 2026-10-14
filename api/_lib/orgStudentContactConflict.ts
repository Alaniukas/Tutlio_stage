import type { SupabaseClient } from '@supabase/supabase-js';
import { findAuthUserByEmail } from './findAuthUserByEmail.js';
import {
  findAuthEmailStudentConflict,
  findStudentEmailConflictAmongRows,
  normalizeContactEmail,
  type OrgStudentContactRow,
  type OrgStudentEmailConflict,
} from '../../src/lib/orgStudentContactConflict.js';

const STUDENT_CONTACT_SELECT =
  'id, full_name, email, linked_user_id, payer_email, organization_id, detached_at';

export async function resolveOrgStudentEmailConflict(
  supabase: SupabaseClient,
  input: {
    organizationId: string;
    fullName: string;
    studentEmail: string;
    excludeStudentIds?: string[];
  },
): Promise<OrgStudentEmailConflict | null> {
  const email = normalizeContactEmail(input.studentEmail);
  if (!email.includes('@')) return null;

  const { data: rows, error } = await supabase
    .from('students')
    .select(STUDENT_CONTACT_SELECT)
    .eq('organization_id', input.organizationId)
    .ilike('email', email);
  if (error) throw new Error(error.message || 'Student email lookup failed');

  const rowConflict = findStudentEmailConflictAmongRows(
    { ...input, email },
    (rows || []) as OrgStudentContactRow[],
  );
  if (rowConflict) return rowConflict;

  const authHit = await findAuthUserByEmail(supabase, email);
  if (!authHit?.id) return null;

  const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(authHit.id);
  const authUser = authData?.user;
  if (authErr || !authUser) return null;

  const meta = (authUser.user_metadata || {}) as Record<string, unknown>;
  const metaStudentId = typeof meta.student_id === 'string' ? meta.student_id : null;
  const metaName = typeof meta.full_name === 'string' ? meta.full_name : null;
  const role = typeof meta.role === 'string' ? meta.role : null;

  const orgFilter = `linked_user_id.eq.${authUser.id}${metaStudentId ? `,id.eq.${metaStudentId}` : ''}`;
  const { data: orgStudents, error: orgErr } = await supabase
    .from('students')
    .select(STUDENT_CONTACT_SELECT)
    .eq('organization_id', input.organizationId)
    .or(orgFilter);
  if (orgErr) throw new Error(orgErr.message || 'Linked student lookup failed');

  const authConflict = findAuthEmailStudentConflict(
    input,
    { id: authUser.id, studentId: metaStudentId, fullName: metaName, role },
    (orgStudents || []) as OrgStudentContactRow[],
  );
  if (!authConflict) return null;
  return { ...authConflict, email };
}
