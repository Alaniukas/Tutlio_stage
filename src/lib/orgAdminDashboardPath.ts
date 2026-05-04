import type { SupabaseClient } from '@supabase/supabase-js';

export type OrgAdminDashboardPath = '/school' | '/company';

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
    .select('organizations(entity_type)')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[getOrgAdminDashboardPath]', error.message);
    return '/company';
  }

  const et = String((data?.organizations as { entity_type?: string } | null)?.entity_type || '').toLowerCase();
  const path: OrgAdminDashboardPath = et === 'school' ? '/school' : '/company';

  try {
    sessionStorage.setItem('tutlio_entity_type', et === 'school' ? 'school' : 'company');
  } catch {
    /* ignore */
  }

  return path;
}
