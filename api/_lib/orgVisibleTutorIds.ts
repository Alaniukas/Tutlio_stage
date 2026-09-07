import {
  buildOrgTutorIdSet,
  filterConfirmedOrgTutors,
} from '../../src/lib/orgVisibleTutors.js';

/**
 * Same rules as src/lib/orgVisibleTutors.ts — server-side list of org *tutor* profile ids
 * (excludes org admins; includes confirmed tutors even if they also have a student row).
 */
export async function getOrgVisibleTutorProfileIds(supabase: any, orgId: string): Promise<string[]> {
  const [{ data: adminUsers }, { data: linkedStudents }, { data: inviteData }, { data: profileRows }] =
    await Promise.all([
      supabase.from('organization_admins').select('user_id').eq('organization_id', orgId),
      supabase.from('students').select('linked_user_id, email, tutor_id').eq('organization_id', orgId),
      supabase.from('tutor_invites').select('used_by_profile_id').eq('organization_id', orgId),
      supabase.from('profiles').select('id, email').eq('organization_id', orgId),
    ]);

  const adminIds = new Set<string>((adminUsers || []).map((a: { user_id: string }) => a.user_id));
  const tutorIdSet = buildOrgTutorIdSet(linkedStudents, inviteData);
  return filterConfirmedOrgTutors(
    (profileRows || []) as Array<{ id: string; email?: string | null }>,
    adminIds,
    tutorIdSet,
  ).map((p) => p.id);
}
