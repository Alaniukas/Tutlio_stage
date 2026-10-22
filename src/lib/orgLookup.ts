import type { SupabaseClient } from '@supabase/supabase-js';

/** Organization metadata already read by the live admin membership check. */
export interface OrgAdminOrganization extends Record<string, unknown> {
  name?: string;
  entity_type?: string;
  tutor_license_count?: number;
  features?: Record<string, unknown> | null;
  enable_per_lesson?: boolean | null;
  enable_monthly_billing?: boolean | null;
}

export const ORG_ADMIN_ORGANIZATION_SELECT =
  'name, entity_type, tutor_license_count, features, enable_per_lesson, enable_monthly_billing';

/** Load an organization row without embedding it under organization_admins / profiles (RLS hang). */
export async function fetchOrganizationRow<T extends Record<string, unknown>>(
  sb: SupabaseClient,
  organizationId: string,
  columns: string,
): Promise<T | null> {
  const { data, error } = await sb
    .from('organizations')
    .select(columns)
    .eq('id', organizationId)
    .maybeSingle();
  if (error) {
    console.warn('[fetchOrganizationRow]', error.message);
    return null;
  }
  return (data as unknown as T | null) ?? null;
}
