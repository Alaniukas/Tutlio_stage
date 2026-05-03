import type { SupabaseClient } from '@supabase/supabase-js';

export type OrgTutorRow = {
  id: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  has_active_license?: boolean | null;
  cancellation_hours?: number | null;
  cancellation_fee_percent?: number | null;
  reminder_student_hours?: number | null;
  reminder_tutor_hours?: number | null;
  break_between_lessons?: number | null;
  min_booking_hours?: number | null;
  company_commission_percent?: number | null;
  personal_meeting_link?: string | null;
};

/**
 * Organization admin UI historically used `profiles.organization_id` as "tutors in org".
 * But students can also have `profiles` rows and/or `organization_id`, so we must
 * explicitly identify real tutors.
 *
 * A "real tutor" is either:
 * - assigned to at least one student in the org (`students.tutor_id`), OR
 * - has accepted a tutor invite in the org (`tutor_invites.used_by_profile_id`).
 *
 * We also exclude:
 * - organization admins
 * - users that match org student accounts (by `students.linked_user_id` and `students.email`)
 */
export async function getOrgVisibleTutors(
  supabase: SupabaseClient,
  orgId: string,
  select: string,
): Promise<OrgTutorRow[]> {
  const [{ data: adminUsers }, { data: linkedStudents }, { data: inviteData }, { data: profileRows }] = await Promise.all([
    supabase.from('organization_admins').select('user_id').eq('organization_id', orgId),
    supabase.from('students').select('linked_user_id, email, tutor_id').eq('organization_id', orgId),
    supabase.from('tutor_invites').select('used_by_profile_id').eq('organization_id', orgId),
    supabase.from('profiles').select(select).eq('organization_id', orgId),
  ]);

  const adminIds = new Set((adminUsers || []).map((a: any) => a.user_id));

  const linkedStudentUserIds = new Set(
    (linkedStudents || [])
      .map((s: any) => s.linked_user_id)
      .filter((id: string | null | undefined): id is string => !!id),
  );
  const linkedStudentEmails = new Set(
    (linkedStudents || [])
      .map((s: any) => String(s.email || '').trim().toLowerCase())
      .filter((email: string) => email.length > 0),
  );

  const assignedTutorIds = new Set(
    (linkedStudents || [])
      .map((s: any) => s.tutor_id)
      .filter((id: string | null | undefined): id is string => !!id),
  );
  const acceptedTutorIds = new Set(
    (inviteData || [])
      .map((inv: any) => inv.used_by_profile_id)
      .filter((id: string | null | undefined): id is string => !!id),
  );
  const tutorIdSet = new Set<string>([...assignedTutorIds, ...acceptedTutorIds]);

  const rows = (profileRows || []) as any[];
  return rows.filter((p) => {
    const email = String(p.email || '').trim().toLowerCase();
    return (
      tutorIdSet.has(p.id) &&
      !adminIds.has(p.id) &&
      !linkedStudentUserIds.has(p.id) &&
      !linkedStudentEmails.has(email)
    );
  });
}

