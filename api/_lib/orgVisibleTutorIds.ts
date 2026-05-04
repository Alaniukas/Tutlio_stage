/**
 * Same rules as src/lib/orgVisibleTutors.ts — server-side list of org *tutor* profile ids
 * (excludes org admins, students-as-profiles, etc.).
 */
export async function getOrgVisibleTutorProfileIds(supabase: any, orgId: string): Promise<string[]> {
  const [{ data: adminUsers }, { data: linkedStudents }, { data: inviteData }, { data: profileRows }] =
    await Promise.all([
      supabase.from('organization_admins').select('user_id').eq('organization_id', orgId),
      supabase.from('students').select('linked_user_id, email, tutor_id').eq('organization_id', orgId),
      supabase.from('tutor_invites').select('used_by_profile_id').eq('organization_id', orgId),
      supabase.from('profiles').select('id, email').eq('organization_id', orgId),
    ]);

  const adminIds = new Set((adminUsers || []).map((a: { user_id: string }) => a.user_id));

  const linkedStudentUserIds = new Set(
    (linkedStudents || [])
      .map((s: { linked_user_id?: string | null }) => s.linked_user_id)
      .filter((id: string | null | undefined): id is string => !!id),
  );
  const linkedStudentEmails = new Set(
    (linkedStudents || [])
      .map((s: { email?: string | null }) => String(s.email || '').trim().toLowerCase())
      .filter((email: string) => email.length > 0),
  );

  const assignedTutorIds = new Set(
    (linkedStudents || [])
      .map((s: { tutor_id?: string | null }) => s.tutor_id)
      .filter((id: string | null | undefined): id is string => !!id),
  );
  const acceptedTutorIds = new Set(
    (inviteData || [])
      .map((inv: { used_by_profile_id?: string | null }) => inv.used_by_profile_id)
      .filter((id: string | null | undefined): id is string => !!id),
  );
  const tutorIdSet = new Set<string>([...Array.from(assignedTutorIds), ...Array.from(acceptedTutorIds)]);

  const rows = (profileRows || []) as Array<{ id: string; email?: string | null }>;
  return rows
    .filter((p) => {
      const email = String(p.email || '').trim().toLowerCase();
      return (
        tutorIdSet.has(p.id) &&
        !adminIds.has(p.id) &&
        !linkedStudentUserIds.has(p.id) &&
        !linkedStudentEmails.has(email)
      );
    })
    .map((p) => p.id);
}
