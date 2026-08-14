import type { SupabaseClient } from '@supabase/supabase-js';
import type { VercelRequest } from '../types.js';
import { verifyRequestAuth } from './auth.js';
import {
  hasOrgAdminPermission,
  normalizeOrgAdminPermissions,
  type OrgAdminPermission,
  type OrgAdminPermissionMap,
  type OrgAdminRole,
  type OrgAdminStatus,
} from '../../src/lib/orgAdminPermissions.js';

export interface OrgAdminAccess {
  id: string;
  userId: string;
  organizationId: string;
  role: OrgAdminRole;
  status: OrgAdminStatus;
  permissions: OrgAdminPermissionMap;
  acceptedAt: string | null;
}

export type OrgAdminAccessResult =
  | { ok: true; access: OrgAdminAccess }
  | { ok: false; status: 401 | 403; error: string };

function isMissingPermissionColumns(error: { code?: string; message?: string } | null): boolean {
  return Boolean(
    error && (
      error.code === '42703'
      || error.code === 'PGRST204'
      || error.message?.includes('does not exist')
    ),
  );
}

export async function insertInitialOrgOwner(
  supabase: SupabaseClient,
  userId: string,
  organizationId: string,
) {
  const primary = await supabase
    .from('organization_admins')
    .insert({
      user_id: userId,
      organization_id: organizationId,
      role: 'owner',
      status: 'active',
      permissions: {},
      accepted_at: new Date().toISOString(),
    });

  if (!isMissingPermissionColumns(primary.error)) return primary;

  // Allows an API deployment to overlap safely with the database migration.
  return await supabase
    .from('organization_admins')
    .insert({ user_id: userId, organization_id: organizationId });
}

export async function getOrgOwnerUserId(
  supabase: SupabaseClient,
  organizationId: string,
): Promise<string | null> {
  const primary = await supabase
    .from('organization_admins')
    .select('user_id')
    .eq('organization_id', organizationId)
    .eq('role', 'owner')
    .eq('status', 'active')
    .maybeSingle();
  if (!primary.error) return primary.data?.user_id ? String(primary.data.user_id) : null;
  if (!isMissingPermissionColumns(primary.error)) return null;

  const legacy = await supabase
    .from('organization_admins')
    .select('user_id')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return legacy.data?.user_id ? String(legacy.data.user_id) : null;
}

export async function getOrgAdminSeatByUserId(
  supabase: SupabaseClient,
  userId: string,
): Promise<OrgAdminAccess | null> {
  const primary = await supabase
    .from('organization_admins')
    .select('id, user_id, organization_id, role, status, permissions, accepted_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (!primary.error && primary.data) {
    const row = primary.data as Record<string, unknown>;
    return {
      id: String(row.id),
      userId: String(row.user_id),
      organizationId: String(row.organization_id),
      role: row.role as OrgAdminRole,
      status: row.status as OrgAdminStatus,
      permissions: normalizeOrgAdminPermissions(row.permissions),
      acceptedAt: typeof row.accepted_at === 'string' ? row.accepted_at : null,
    };
  }

  // Safe rolling-deploy fallback: before the schema migration every existing
  // organization admin was effectively the owner.
  if (isMissingPermissionColumns(primary.error)) {
    const legacy = await supabase
      .from('organization_admins')
      .select('id, user_id, organization_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (!legacy.data) return null;
    return {
      id: String(legacy.data.id),
      userId: String(legacy.data.user_id),
      organizationId: String(legacy.data.organization_id),
      role: 'owner',
      status: 'active',
      permissions: {},
      acceptedAt: null,
    };
  }

  return null;
}

export async function getOrgAdminAccessByUserId(
  supabase: SupabaseClient,
  userId: string,
): Promise<OrgAdminAccess | null> {
  const seat = await getOrgAdminSeatByUserId(supabase, userId);
  return seat?.status === 'active' ? seat : null;
}

export async function requireOrgAdminAccess(
  req: VercelRequest,
  supabase: SupabaseClient,
  permission?: OrgAdminPermission,
): Promise<OrgAdminAccessResult> {
  const auth = await verifyRequestAuth(req);
  if (!auth?.userId || auth.isInternal) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const access = await getOrgAdminAccessByUserId(supabase, auth.userId);
  if (!access) {
    return { ok: false, status: 403, error: 'Organization access is inactive' };
  }

  if (permission && !hasOrgAdminPermission(access.role, access.permissions, permission)) {
    return { ok: false, status: 403, error: 'Insufficient organization permission' };
  }

  return { ok: true, access };
}

export function isOrgOwner(access: OrgAdminAccess): boolean {
  return access.role === 'owner' && access.status === 'active';
}
