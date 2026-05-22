import { supabase } from '@/lib/supabase';
import { orgAdminRowByUserDeduped, rpcGetStudentByUserIdDeduped } from '@/lib/preload';
import { getOrgAdminDashboardPath } from '@/lib/orgAdminDashboardPath';

export type LoginPortal = 'tutor' | 'student' | 'parent' | 'org_admin';

export interface AccountPortals {
  orgAdmin: boolean;
  parent: boolean;
  student: boolean;
  /** Tutor platform account (profiles row). */
  tutor: boolean;
}

export async function resolveAccountPortals(
  userId: string,
  options?: { email?: string | null; linkStudentByEmail?: boolean },
): Promise<AccountPortals> {
  const email = (options?.email || '').trim();

  const [orgAdminRow, parentResult, studentResult, profileResult] = await Promise.all([
    orgAdminRowByUserDeduped(userId),
    supabase.rpc('get_parent_profile_id_by_user_id', { p_user_id: userId }),
    rpcGetStudentByUserIdDeduped(userId),
    supabase.from('profiles').select('id').eq('id', userId).maybeSingle(),
  ]);

  let student = Boolean(studentResult?.data?.[0]);
  const parent = Boolean(parentResult?.data && !parentResult.error);
  const tutor = Boolean(profileResult?.data?.id);
  const orgAdmin = Boolean(orgAdminRow);

  if (!student && options?.linkStudentByEmail && email) {
    try {
      const { data: linkRows, error: rpcError } = await supabase.rpc('get_student_by_email_for_linking', {
        p_email: email,
      });
      if (!rpcError) {
        const linkRow = linkRows?.[0];
        if (linkRow) {
          if (!linkRow.linked_user_id) {
            await supabase.from('students').update({ linked_user_id: userId }).eq('id', linkRow.id);
          }
          student = true;
        }
      }
    } catch {
      // Non-fatal — caller treats as "no student".
    }
  }

  return { orgAdmin, parent, student, tutor };
}

export function canAccessLoginPortal(portals: AccountPortals, portal: LoginPortal): boolean {
  switch (portal) {
    case 'org_admin':
      return portals.orgAdmin;
    case 'parent':
      return portals.parent;
    case 'student':
      return portals.student;
    case 'tutor':
      return portals.tutor;
    default:
      return false;
  }
}

/** Primary app path for an authenticated user (org admin → company/school dashboard). */
export async function getHomePathForPortals(
  userId: string,
  portals: AccountPortals,
): Promise<string | null> {
  if (portals.orgAdmin) {
    return getOrgAdminDashboardPath(supabase, userId);
  }
  if (portals.parent) return '/parent';
  if (portals.student) return '/student';
  if (portals.tutor) return '/dashboard';
  return null;
}

export function loginErrorKeyForPortalMismatch(
  portal: LoginPortal,
  portals: AccountPortals,
): string {
  if (portal === 'student' && portals.tutor && !portals.student) return 'login.noStudentFound';
  if (portal === 'parent' && !portals.parent) {
    if (portals.tutor) return 'login.noParentFound';
    if (portals.student) return 'login.noParentFound';
    return 'login.noParentFound';
  }
  if (portal === 'tutor') {
    if (portals.orgAdmin && !portals.tutor) return 'login.useOrgAdminLogin';
    if (portals.student && !portals.tutor) return 'login.noTutorFound';
    if (portals.parent && !portals.tutor) return 'login.noTutorFound';
    return 'login.noTutorFound';
  }
  return 'auth.invalidCredentials';
}
