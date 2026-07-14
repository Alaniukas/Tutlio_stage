import { supabase } from '@/lib/supabase';

/**
 * Org feature `disable_student_booking`: self-booking is turned off for the
 * student's organization (lessons are created only by the org admin/tutor).
 *
 * Students/parents carry no organization_id on their own auth profile, so the
 * org is resolved from the student row, falling back to the tutor's profile.
 * Lookups fail open (booking UI stays visible) — the sessions INSERT policy
 * enforces the flag server-side regardless.
 */
export async function fetchSelfBookingDisabledMap(
  studentIds: Array<string | null | undefined>,
): Promise<Record<string, boolean>> {
  const ids = [...new Set(studentIds.filter((id): id is string => !!id))];
  const result: Record<string, boolean> = {};
  if (ids.length === 0) return result;
  try {
    const { data: rows } = await supabase
      .from('students')
      .select('id, organization_id, tutor_id')
      .in('id', ids);
    const students = (rows ?? []) as Array<{
      id: string;
      organization_id: string | null;
      tutor_id: string | null;
    }>;

    const tutorIds = [
      ...new Set(
        students
          .filter((s) => !s.organization_id && s.tutor_id)
          .map((s) => s.tutor_id as string),
      ),
    ];
    const tutorOrg: Record<string, string | null> = {};
    if (tutorIds.length > 0) {
      const { data: tps } = await supabase
        .from('profiles')
        .select('id, organization_id')
        .in('id', tutorIds);
      for (const tp of (tps ?? []) as Array<{ id: string; organization_id: string | null }>) {
        tutorOrg[tp.id] = tp.organization_id;
      }
    }

    const orgOfStudent: Record<string, string | null> = {};
    for (const s of students) {
      orgOfStudent[s.id] = s.organization_id ?? (s.tutor_id ? tutorOrg[s.tutor_id] ?? null : null);
    }

    const orgIds = [...new Set(Object.values(orgOfStudent).filter((v): v is string => !!v))];
    const disabledByOrg: Record<string, boolean> = {};
    if (orgIds.length > 0) {
      const { data: orgs } = await supabase
        .from('organizations')
        .select('id, features')
        .in('id', orgIds);
      for (const o of (orgs ?? []) as Array<{ id: string; features: Record<string, unknown> | null }>) {
        disabledByOrg[o.id] = o.features?.disable_student_booking === true;
      }
    }

    for (const id of ids) {
      const orgId = orgOfStudent[id];
      result[id] = orgId ? disabledByOrg[orgId] === true : false;
    }
  } catch {
    // fail open — see doc comment
  }
  return result;
}

export async function isSelfBookingDisabledForStudent(
  studentId: string | null | undefined,
): Promise<boolean> {
  if (!studentId) return false;
  const map = await fetchSelfBookingDisabledMap([studentId]);
  return map[studentId] === true;
}
