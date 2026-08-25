import type { SupabaseClient } from '@supabase/supabase-js';
import { hasOrgAdminPermission, normalizeOrgAdminPermissions, type OrgAdminPermission, type OrgAdminRole } from './orgAdminPermissions';

export type OrgAdminDashboardPath = '/school' | '/company' | string;

const LOOKUP_TIMEOUT_MS = 8000;

function missingColumns(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (
    error.code === '42703'
    || error.code === 'PGRST204'
    || error.message?.includes('does not exist')
  ));
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Org admin path timeout')), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Org admin portalio šakninis kelias pagal `organizations.entity_type`.
 * Sinchronizuoja `sessionStorage` `tutlio_entity_type` su `CompanyLayout`.
 *
 * Never embed `organizations(...)` here — that join re-enters RLS and has hung
 * school/company login as "Jungiamasi…" after SIGNED_IN.
 */
export async function getOrgAdminDashboardPath(
  sb: SupabaseClient,
  userId: string,
): Promise<OrgAdminDashboardPath> {
  try {
    return await withTimeout(resolveOrgAdminDashboardPath(sb, userId), LOOKUP_TIMEOUT_MS);
  } catch (err) {
    console.warn('[getOrgAdminDashboardPath]', err instanceof Error ? err.message : err);
    return '/company';
  }
}

async function resolveOrgAdminDashboardPath(
  sb: SupabaseClient,
  userId: string,
): Promise<OrgAdminDashboardPath> {
  const primary = await sb
    .from('organization_admins')
    .select('role, permissions, status, organization_id')
    .eq('user_id', userId)
    .maybeSingle();

  let row = primary.data as Record<string, unknown> | null;
  if (primary.error && missingColumns(primary.error)) {
    const legacy = await sb
      .from('organization_admins')
      .select('organization_id')
      .eq('user_id', userId)
      .maybeSingle();
    row = (legacy.data as Record<string, unknown> | null) ?? null;
  } else if (primary.error) {
    console.warn('[getOrgAdminDashboardPath]', primary.error.message);
    return '/company';
  }

  if (!row?.organization_id) return '/company';

  const organizationId = String(row.organization_id);
  let entityType = '';
  if (organizationId) {
    const org = await sb
      .from('organizations')
      .select('entity_type')
      .eq('id', organizationId)
      .maybeSingle();
    if (!org.error) entityType = String(org.data?.entity_type || '');
  }

  const et = entityType.toLowerCase();
  const base: '/school' | '/company' = et === 'school' ? '/school' : '/company';
  const role = row?.role as OrgAdminRole | undefined;
  const permissions = normalizeOrgAdminPermissions(row?.permissions);
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
  const path: OrgAdminDashboardPath = row?.status && row.status !== 'active'
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
