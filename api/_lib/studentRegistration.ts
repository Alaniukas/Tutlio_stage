import type { SupabaseClient } from '@supabase/supabase-js';
import type { StudentRegistrationState } from '../../src/lib/studentRegistration.js';

/** Auth data stays on the server; the RPC returns only client registration states. */
export async function loadStudentRegistrationStates(
  db: SupabaseClient, organizationId: string, tutorId: string | null = null,
): Promise<StudentRegistrationState[]> {
  const states: StudentRegistrationState[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.rpc('org_student_registration_states', {
      p_organization_id: organizationId, p_tutor_id: tutorId,
    }).range(offset, offset + 999);
    if (error) throw new Error(`Registration lookup failed: ${error.message}`);
    states.push(...(data || []));
    if (!data || data.length < 1000) return states;
  }
}
