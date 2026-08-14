import { supabase } from '@/lib/supabase';
import { orgAdminRowByUserDeduped, rpcGetStudentByUserIdDeduped } from '@/lib/preload';
import { getOrgAdminDashboardPath } from '@/lib/orgAdminDashboardPath';
import { hasAnySubscriptionStatus } from '@/lib/subscription';

export type LoginPortal = 'tutor' | 'student' | 'parent' | 'org_admin';

export type RolePortal = 'student' | 'tutor';

const LAST_ROLE_PORTAL_KEY = 'tutlio_last_portal';

export function setLastRolePortal(portal: RolePortal): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LAST_ROLE_PORTAL_KEY, portal);
  } catch {
    /* ignore */
  }
}

export function getLastRolePortal(): RolePortal | null {
  if (typeof window === 'undefined') return null;
  try {
    const v = localStorage.getItem(LAST_ROLE_PORTAL_KEY);
    return v === 'student' || v === 'tutor' ? v : null;
  } catch {
    return null;
  }
}

export interface AccountPortals {
  orgAdmin: boolean;
  parent: boolean;
  student: boolean;
  /** Tutor platform account (profiles row). */
  tutor: boolean;
}

/** Profile row fields used to decide whether this user is a real tutor, not a ghost profiles row. */
export type TutorProfileGate = {
  id?: string;
  organization_id?: string | null;
  subscription_status?: string | null;
  manual_subscription_exempt?: boolean | null;
};

/**
 * A linked `students` row plus a bare `profiles` row (no org, no subscription) is a
 * student account — not a dual-role tutor. Ghost profiles often come from QA seeds
 * or auth metadata upserts during email confirmation.
 */
export function profileQualifiesAsTutor(
  profile: TutorProfileGate | null | undefined,
  hasStudentRow: boolean,
): boolean {
  if (!profile?.id) return false;
  if (profile.organization_id) return true;
  if (profile.manual_subscription_exempt === true) return true;
  if (hasAnySubscriptionStatus(profile.subscription_status)) return true;
  if (hasStudentRow) return false;
  return true;
}

export function profileQualifiesForTutorPortal(
  profile: TutorProfileGate | null | undefined,
  hasStudentRow: boolean,
  hasOrgAdminSeat: boolean,
): boolean {
  return !hasOrgAdminSeat && profileQualifiesAsTutor(profile, hasStudentRow);
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
    supabase
      .from('profiles')
      .select('id, organization_id, subscription_status, manual_subscription_exempt')
      .eq('id', userId)
      .maybeSingle(),
  ]);

  let student = Boolean(studentResult?.data?.[0]);
  const parent = Boolean(parentResult?.data && !parentResult.error);
  const orgAdmin = Boolean(orgAdminRow);
  // Organization administration seats are intentionally single-role accounts.
  // Their profile row stores display/locale data, not a tutor entitlement.
  const tutor = profileQualifiesForTutorPortal(profileResult?.data, student, orgAdmin);
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

  // Genuine dual-role (org tutor + student): honour last-used portal.
  if (portals.tutor && portals.student) {
    const lastRole = getLastRolePortal();
    if (lastRole === 'student') return '/student';
    if (lastRole === 'tutor') return '/dashboard';
    const { data: prof } = await supabase
      .from('profiles')
      .select('organization_id')
      .eq('id', userId)
      .maybeSingle();
    if (prof?.organization_id) return '/dashboard';
    return '/student';
  }

  if (portals.student) return '/student';  if (portals.tutor) return '/dashboard';
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
