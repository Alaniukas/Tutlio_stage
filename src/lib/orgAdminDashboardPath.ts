import type { SupabaseClient } from '@supabase/supabase-js';
import { hasOrgAdminPermission, normalizeOrgAdminPermissions, type OrgAdminPermission, type OrgAdminRole } from './orgAdminPermissions';

export type OrgAdminDashboardPath = '/school' | '/company' | string;

/**
 * Org admin portalio šakninis kelias pagal `organizations.entity_type`.
 * Sinchronizuoja `sessionStorage` `tutlio_entity_type` su `CompanyLayout`.
 */
export async function getOrgAdminDashboardPath(
  sb: SupabaseClient,
  userId: string,
): Promise<OrgAdminDashboardPath> {
  const { data, error } = await sb
    .from('organization_admins')
    .select('role, permissions, status, organizations(entity_type)')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    const missingColumns = error.code === '42703' || error.code === 'PGRST204' || error.message?.includes('does not exist');
    if (!missingColumns) {
      console.warn('[getOrgAdminDashboardPath]', error.message);
      return '/company';
    }
    const legacy = await sb
      .from('organization_admins')
      .select('organizations(entity_type)')
      .eq('user_id', userId)
      .maybeSingle();
    const legacyType = String((legacy.data?.organizations as { entity_type?: string } | null)?.entity_type || '').toLowerCase();
    return legacyType === 'school' ? '/school' : '/company';
  }

  const et = String((data?.organizations as { entity_type?: string } | null)?.entity_type || '').toLowerCase();
  const base: '/school' | '/company' = et === 'school' ? '/school' : '/company';
  const role = data?.role as OrgAdminRole | undefined;
  const permissions = normalizeOrgAdminPermissions(data?.permissions);
  const choices: Array<[OrgAdminPermission, string]> = [
    ['dashboard.view', base],
    ['tutors.view', `${base}/tutors`],
    ['students.view', `${base}/students`],
    ['sessions.view', `${base}/schedule`],
    ['messages.view', `${base}/messages`],
    ['stats.view', `${base}/stats`],
    ['finance.view', `${base}/finance`],
    ['contracts.view', `${base}/contracts`],
    ['settings.view', `${base}/settings`],
  ];
  const path: OrgAdminDashboardPath = data?.status !== 'active'
    ? base
    : choices.find(([permission]) => hasOrgAdminPermission(role, permissions, permission))?.[1]
      || `${base}/instructions`;

  try {
    sessionStorage.setItem('tutlio_entity_type', et === 'school' ? 'school' : 'company');
  } catch {
    /* ignore */
  }

  return path;
}
