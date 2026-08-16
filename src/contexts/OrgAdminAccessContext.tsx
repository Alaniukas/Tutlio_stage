import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/contexts/UserContext';
import {
  hasOrgAdminPermission,
  normalizeOrgAdminPermissions,
  type OrgAdminPermission,
  type OrgAdminPermissionMap,
  type OrgAdminRole,
  type OrgAdminStatus,
} from '@/lib/orgAdminPermissions';

export interface OrgAdminMembership {
  id: string;
  userId: string;
  organizationId: string;
  role: OrgAdminRole;
  status: OrgAdminStatus;
  permissions: OrgAdminPermissionMap;
  acceptedAt: string | null;
  organizationName: string;
  entityType: 'school' | 'company';
}

interface OrgAdminAccessContextValue {
  loading: boolean;
  membership: OrgAdminMembership | null;
  isOwner: boolean;
  can: (permission: OrgAdminPermission) => boolean;
  refresh: () => Promise<void>;
  firstAllowedPath: (base?: '/school' | '/company') => string;
}

const OrgAdminAccessContext = createContext<OrgAdminAccessContextValue | null>(null);

function missingColumns(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (
    error.code === '42703'
    || error.code === 'PGRST204'
    || error.message?.includes('does not exist')
  ));
}

async function withAbort<T>(run: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

export function OrgAdminAccessProvider({ children }: { children: ReactNode }) {
  const { user, loading: userLoading } = useUser();
  const [loading, setLoading] = useState(true);
  const [membership, setMembership] = useState<OrgAdminMembership | null>(null);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (userLoading) return;
    if (!user) {
      setMembership(null);
      setResolvedUserId(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Never embed organizations(*) here. That join re-enters RLS on
      // organizations + organization_admins and has hung school/company login
      // as a blank spinner (see hotfix_org_admin_login_hang).
      const seat = await withAbort(async (signal) => {
        const primary = await supabase
          .from('organization_admins')
          .select('id, user_id, organization_id, role, status, permissions, accepted_at')
          .eq('user_id', user.id)
          .abortSignal(signal)
          .maybeSingle();

        if (!primary.error && primary.data) return { row: primary.data as Record<string, unknown>, legacy: false };
        if (!missingColumns(primary.error)) return { row: null, legacy: false };

        const legacy = await supabase
          .from('organization_admins')
          .select('id, user_id, organization_id')
          .eq('user_id', user.id)
          .abortSignal(signal)
          .maybeSingle();
        return { row: (legacy.data as Record<string, unknown> | null) ?? null, legacy: true };
      }, 8000);

      if (!seat.row) {
        setMembership(null);
        return;
      }

      const row = seat.row;
      const organizationId = String(row.organization_id || '');
      let organizationName = '';
      let entityType: 'school' | 'company' = 'company';
      if (organizationId) {
        try {
          const org = await withAbort(async (signal) => (
            await supabase
              .from('organizations')
              .select('name, entity_type')
              .eq('id', organizationId)
              .abortSignal(signal)
              .maybeSingle()
          ), 4000);
          if (!org.error && org.data) {
            organizationName = String(org.data.name || '');
            entityType = org.data.entity_type === 'school' ? 'school' : 'company';
          }
        } catch (err) {
          console.warn('[OrgAdminAccess] organization lookup failed:', err);
        }
      }

      const next: OrgAdminMembership = {
        id: String(row.id),
        userId: String(row.user_id),
        organizationId,
        role: seat.legacy ? 'owner' : row.role as OrgAdminRole,
        status: seat.legacy ? 'active' : row.status as OrgAdminStatus,
        permissions: seat.legacy ? {} : normalizeOrgAdminPermissions(row.permissions),
        acceptedAt: typeof row.accepted_at === 'string' ? row.accepted_at : null,
        organizationName,
        entityType,
      };
      setMembership(next.status === 'active' ? next : null);

      if (next.status === 'active' && !next.acceptedAt) {
        void supabase.auth.getSession().then(async ({ data }) => {
          const token = data.session?.access_token;
          if (!token) return;
          const response = await fetch('/api/org-admin-members', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ action: 'accept' }),
          }).catch(() => null);
          if (response?.ok) {
            setMembership((current) => current ? { ...current, acceptedAt: new Date().toISOString() } : current);
          }
        });
      }
    } catch (err) {
      console.warn('[OrgAdminAccess] seat lookup failed:', err);
      setMembership(null);
    } finally {
      setResolvedUserId(user.id);
      setLoading(false);
    }
  }, [user?.id, userLoading]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<OrgAdminAccessContextValue>(() => {
    const currentUserId = user?.id || null;
    const currentMembership = resolvedUserId === currentUserId ? membership : null;
    const currentLoading = userLoading || loading || resolvedUserId !== currentUserId;
    const can = (permission: OrgAdminPermission) => (
      currentMembership?.status === 'active'
      && hasOrgAdminPermission(currentMembership.role, currentMembership.permissions, permission)
    );
    const firstAllowedPath = (base?: '/school' | '/company') => {
      const portalBase = base || (currentMembership?.entityType === 'school' ? '/school' : '/company');
      const choices: Array<[OrgAdminPermission, string]> = [
        ['dashboard.view', portalBase],
        ['tutors.view', `${portalBase}/tutors`],
        ['students.view', `${portalBase}/students`],
        ['sessions.view', `${portalBase}/schedule`],
        ['messages.view', `${portalBase}/messages`],
        ['stats.view', `${portalBase}/stats`],
        ['finance.view', `${portalBase}/finance`],
        ['contracts.view', `${portalBase}/contracts`],
        ['settings.view', `${portalBase}/settings`],
      ];
      return choices.find(([permission]) => can(permission))?.[1] || `${portalBase}/instructions`;
    };
    return {
      loading: currentLoading,
      membership: currentMembership,
      isOwner: currentMembership?.role === 'owner' && currentMembership.status === 'active',
      can,
      refresh,
      firstAllowedPath,
    };
  }, [loading, membership, refresh, resolvedUserId, user?.id, userLoading]);

  return <OrgAdminAccessContext.Provider value={value}>{children}</OrgAdminAccessContext.Provider>;
}

export function useOrgAdminAccess(): OrgAdminAccessContextValue {
  const context = useContext(OrgAdminAccessContext);
  if (!context) throw new Error('useOrgAdminAccess must be used within OrgAdminAccessProvider');
  return context;
}
