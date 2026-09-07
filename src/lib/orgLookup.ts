import type { SupabaseClient } from '@supabase/supabase-js';

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
