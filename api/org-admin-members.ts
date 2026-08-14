import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { supabaseServiceRoleClientOptions } from './_lib/supabaseServiceRoleClientOptions.js';
import {
  permissionsForRole,
  normalizeOrgAdminPermissions,
  type OrgAdminPermissionMap,
  type OrgAdminRole,
} from '../src/lib/orgAdminPermissions.js';
import { isOrgOwner, requireOrgAdminAccess } from './_lib/orgAdminAccess.js';

type ManagedRole = Exclude<OrgAdminRole, 'owner'>;

function json(res: VercelResponse, status: number, body: Record<string, unknown>) {
  return res.status(status).json(body);
}

function serviceClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, supabaseServiceRoleClientOptions());
}

function parseManagedRole(value: unknown): ManagedRole | null {
  return value === 'admin' || value === 'accountant' || value === 'custom' ? value : null;
}

function permissionsForInput(role: ManagedRole, raw: unknown): OrgAdminPermissionMap {
  return permissionsForRole(role, role === 'custom' ? normalizeOrgAdminPermissions(raw) : {});
}

async function audit(
  supabase: NonNullable<ReturnType<typeof serviceClient>>,
  organizationId: string,
  actorUserId: string,
  targetUserId: string | null,
  action: string,
  details: Record<string, unknown> = {},
) {
  const { error } = await supabase.from('organization_admin_audit').insert({
    organization_id: organizationId,
    actor_user_id: actorUserId,
    target_user_id: targetUserId,
    action,
    details,
  });
  if (error) console.warn('[org-admin-members] audit failed:', error.message);
}

async function listMembers(
  supabase: NonNullable<ReturnType<typeof serviceClient>>,
  organizationId: string,
) {
  const { data: rows, error } = await supabase
    .from('organization_admins')
    .select('id, user_id, role, status, permissions, invited_by_user_id, accepted_at, revoked_at, created_at, updated_at')
    .eq('organization_id', organizationId)
    .is('revoked_at', null)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const userIds = (rows || []).map((row) => row.user_id).filter(Boolean);
  const { data: profiles } = userIds.length > 0
    ? await supabase.from('profiles').select('id, full_name, email').in('id', userIds)
    : { data: [] as Array<{ id: string; full_name: string | null; email: string | null }> };
  const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));

  return (rows || []).map((row) => {
    const profile = profileById.get(row.user_id);
    return {
      id: row.id,
      userId: row.user_id,
      fullName: profile?.full_name || '',
      email: profile?.email || '',
      role: row.role,
      status: row.status,
      permissions: normalizeOrgAdminPermissions(row.permissions),
      invitedByUserId: row.invited_by_user_id,
      acceptedAt: row.accepted_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabase = serviceClient();
  if (!supabase) return json(res, 500, { error: 'Missing Supabase environment variables' });

  try {
    const action = String(req.body?.action || '').trim();

    // Invitation acceptance is available to the invited seat itself. The row
    // is active from invitation time so all later authorization is still
    // revocable immediately through membership status.
    if (req.method === 'POST' && action === 'accept') {
      const accessResult = await requireOrgAdminAccess(req, supabase);
      if (accessResult.ok === false) return json(res, accessResult.status, { error: accessResult.error });
      const { access } = accessResult;
      if (!access.acceptedAt) {
        const now = new Date().toISOString();
        const { error } = await supabase
          .from('organization_admins')
          .update({ accepted_at: now, updated_at: now })
          .eq('id', access.id)
          .eq('user_id', access.userId);
        if (error) return json(res, 500, { error: error.message });
      }
      return json(res, 200, { success: true });
    }

    const accessResult = await requireOrgAdminAccess(req, supabase);
    if (accessResult.ok === false) return json(res, accessResult.status, { error: accessResult.error });
    const { access } = accessResult;
    if (!isOrgOwner(access)) return json(res, 403, { error: 'Only the organization owner can manage seats' });

    if (req.method === 'GET') {
      const members = await listMembers(supabase, access.organizationId);
      return json(res, 200, { members, currentUserId: access.userId });
    }

    if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

    if (action === 'invite') {
      const email = String(req.body?.email || '').trim().toLowerCase();
      const fullName = String(req.body?.fullName || '').trim();
      const role = parseManagedRole(req.body?.role);
      if (!email || !/^\S+@\S+\.\S+$/.test(email)) return json(res, 400, { error: 'Valid email is required' });
      if (!fullName) return json(res, 400, { error: 'Full name is required' });
      if (!role) return json(res, 400, { error: 'Invalid role' });

      const appUrl = (process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt').replace(/\/$/, '');
      const { data: invited, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${appUrl}/auth/callback?next=/reset-password`,
        data: { full_name: fullName, invited_to_org: true },
      });
      if (inviteError || !invited.user) {
        return json(res, 409, {
          error: inviteError?.message || 'Could not invite this email. It may already belong to another Tutlio account.',
        });
      }

      const invitedUserId = invited.user.id;
      const permissions = permissionsForInput(role, req.body?.permissions);
      const now = new Date().toISOString();
      const { error: membershipError } = await supabase.from('organization_admins').insert({
        user_id: invitedUserId,
        organization_id: access.organizationId,
        role,
        permissions,
        status: 'active',
        invited_by_user_id: access.userId,
        accepted_at: null,
        updated_at: now,
      });
      if (membershipError) {
        await supabase.auth.admin.deleteUser(invitedUserId).catch(() => undefined);
        return json(res, 500, { error: membershipError.message });
      }

      const { error: profileError } = await supabase.from('profiles').upsert({
        id: invitedUserId,
        email,
        full_name: fullName,
        organization_id: access.organizationId,
      }, { onConflict: 'id' });
      if (profileError) {
        await supabase.auth.admin.deleteUser(invitedUserId).catch(() => undefined);
        return json(res, 500, { error: profileError.message });
      }

      await audit(supabase, access.organizationId, access.userId, invitedUserId, 'seat.invited', { role, permissions });
      return json(res, 201, { success: true, members: await listMembers(supabase, access.organizationId) });
    }

    const memberId = String(req.body?.memberId || '').trim();
    if (!memberId) return json(res, 400, { error: 'Member ID is required' });
    const { data: target, error: targetError } = await supabase
      .from('organization_admins')
      .select('id, user_id, organization_id, role, status, accepted_at, revoked_at')
      .eq('id', memberId)
      .eq('organization_id', access.organizationId)
      .maybeSingle();
    if (targetError || !target) return json(res, 404, { error: 'Seat not found' });
    if (target.revoked_at) return json(res, 404, { error: 'Seat has already been removed' });

    if (action === 'update') {
      if (target.role === 'owner') return json(res, 400, { error: 'Owner permissions cannot be restricted' });
      const role = parseManagedRole(req.body?.role);
      if (!role) return json(res, 400, { error: 'Invalid role' });
      const permissions = permissionsForInput(role, req.body?.permissions);
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('organization_admins')
        .update({ role, permissions, updated_at: now })
        .eq('id', memberId)
        .eq('organization_id', access.organizationId);
      if (error) return json(res, 500, { error: error.message });
      await audit(supabase, access.organizationId, access.userId, target.user_id, 'seat.permissions_updated', { role, permissions });
      return json(res, 200, { success: true, members: await listMembers(supabase, access.organizationId) });
    }

    if (action === 'set_status') {
      if (target.role === 'owner') return json(res, 400, { error: 'The owner cannot be suspended' });
      const status = req.body?.status === 'active' || req.body?.status === 'suspended' ? req.body.status : null;
      if (!status) return json(res, 400, { error: 'Invalid status' });
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('organization_admins')
        .update({ status, updated_at: now })
        .eq('id', memberId)
        .eq('organization_id', access.organizationId);
      if (error) return json(res, 500, { error: error.message });
      await audit(supabase, access.organizationId, access.userId, target.user_id, `seat.${status}`);
      return json(res, 200, { success: true, members: await listMembers(supabase, access.organizationId) });
    }

    if (action === 'remove') {
      if (target.role === 'owner' || target.user_id === access.userId) {
        return json(res, 400, { error: 'The organization owner cannot be removed' });
      }
      const { error: revokeError } = await supabase.rpc('revoke_org_admin_seat', {
        p_org_id: access.organizationId,
        p_owner_user_id: access.userId,
        p_target_user_id: target.user_id,
      });
      if (revokeError) return json(res, 500, { error: revokeError.message });

      // The database tombstone has already removed all access. Auth deletion is
      // best-effort because Supabase can reject hard deletion for users that own
      // Storage objects; that must not undo or delay the security revocation.
      const { error: deleteError } = await supabase.auth.admin.deleteUser(target.user_id);
      if (deleteError) console.warn('[org-admin-members] revoked seat auth cleanup failed:', deleteError.message);
      await audit(supabase, access.organizationId, access.userId, null, 'seat.removed', {
        removedUserId: target.user_id,
        authUserDeleted: !deleteError,
        ...(deleteError ? { authCleanupError: deleteError.message } : {}),
      });
      return json(res, 200, {
        success: true,
        authUserDeleted: !deleteError,
        members: await listMembers(supabase, access.organizationId),
      });
    }

    if (action === 'transfer_owner') {
      if (target.status !== 'active' || !target.accepted_at) {
        return json(res, 400, { error: 'Ownership can only be transferred to an active accepted seat' });
      }
      const { error } = await supabase.rpc('transfer_org_admin_ownership', {
        p_org_id: access.organizationId,
        p_current_owner_user_id: access.userId,
        p_new_owner_user_id: target.user_id,
      });
      if (error) return json(res, 500, { error: error.message });
      await audit(supabase, access.organizationId, access.userId, target.user_id, 'ownership.transferred');
      return json(res, 200, { success: true, members: await listMembers(supabase, access.organizationId) });
    }

    return json(res, 400, { error: 'Unsupported action' });
  } catch (error: any) {
    console.error('[org-admin-members]', error?.message || error);
    return json(res, 500, { error: error?.message || 'Internal server error' });
  }
}
