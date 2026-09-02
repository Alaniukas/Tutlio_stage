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
  company_commission_by_subject?: Record<string, number> | null;
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
 * We also exclude organization admins.
 *
 * Confirmed org tutors (assigned or accepted invite) are never hidden just because they
 * also have a linked student row — that case broke real tutors who were added as test students.
 */
export function buildOrgTutorIdSet(
  linkedStudents: Array<{ tutor_id?: string | null }> | null | undefined,
  inviteData: Array<{ used_by_profile_id?: string | null }> | null | undefined,
): Set<string> {
  const assignedTutorIds = new Set(
    (linkedStudents || [])
      .map((s) => s.tutor_id)
      .filter((id: string | null | undefined): id is string => !!id),
  );
  const acceptedTutorIds = new Set(
    (inviteData || [])
      .map((inv) => inv.used_by_profile_id)
      .filter((id: string | null | undefined): id is string => !!id),
  );
  return new Set<string>([...assignedTutorIds, ...acceptedTutorIds]);
}

export function filterConfirmedOrgTutors<T extends { id: string }>(
  profileRows: T[],
  adminIds: Set<string>,
  tutorIdSet: Set<string>,
): T[] {
  return profileRows.filter((p) => tutorIdSet.has(p.id) && !adminIds.has(p.id));
}

export async function getOrgVisibleTutors(
  supabase: SupabaseClient,
  orgId: string,
  select: string,
): Promise<OrgTutorRow[]> {
  const [
    { data: adminUsers },
    { data: teammateAdmins },
    visibleTutorIds,
    { data: linkedStudents },
    { data: inviteData },
    { data: profileRows },
  ] = await Promise.all([
    supabase.from('organization_admins').select('user_id').eq('organization_id', orgId),
    supabase.rpc('get_my_org_admin_user_ids'),
    supabase.rpc('get_my_org_visible_tutor_ids'),
    supabase.from('students').select('linked_user_id, email, tutor_id').eq('organization_id', orgId),
    supabase.from('tutor_invites').select('used_by_profile_id').eq('organization_id', orgId),
    supabase.from('profiles').select(select).eq('organization_id', orgId),
  ]);

  const adminIds = new Set(
    [...(adminUsers || []), ...(teammateAdmins || [])].map((a: any) => a.user_id),
  );

  const tutorIdSet = !visibleTutorIds.error && (adminUsers || []).length > 0
    ? new Set<string>((visibleTutorIds.data || []).map((row: any) => row.user_id).filter(Boolean))
    : buildOrgTutorIdSet(linkedStudents, inviteData);
  return filterConfirmedOrgTutors((profileRows || []) as unknown as OrgTutorRow[], adminIds, tutorIdSet);
}
