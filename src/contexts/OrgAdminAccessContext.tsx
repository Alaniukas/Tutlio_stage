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
    const primary = await supabase
      .from('organization_admins')
      .select('id, user_id, organization_id, role, status, permissions, accepted_at, organizations(name, entity_type)')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!primary.error && primary.data) {
      const row = primary.data as any;
      const org = row.organizations as { name?: string; entity_type?: string } | null;
      const next: OrgAdminMembership = {
        id: String(row.id),
        userId: String(row.user_id),
        organizationId: String(row.organization_id),
        role: row.role as OrgAdminRole,
        status: row.status as OrgAdminStatus,
        permissions: normalizeOrgAdminPermissions(row.permissions),
        acceptedAt: typeof row.accepted_at === 'string' ? row.accepted_at : null,
        organizationName: String(org?.name || ''),
        entityType: org?.entity_type === 'school' ? 'school' : 'company',
      };
      setMembership(next.status === 'active' ? next : null);
      setResolvedUserId(user.id);
      setLoading(false);

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
      return;
    }

    if (missingColumns(primary.error)) {
      const legacy = await supabase
        .from('organization_admins')
        .select('id, user_id, organization_id, organizations(name, entity_type)')
        .eq('user_id', user.id)
        .maybeSingle();
      if (legacy.data) {
        const row = legacy.data as any;
        const org = row.organizations as { name?: string; entity_type?: string } | null;
        setMembership({
          id: String(row.id),
          userId: String(row.user_id),
          organizationId: String(row.organization_id),
          role: 'owner',
          status: 'active',
          permissions: {},
          acceptedAt: null,
          organizationName: String(org?.name || ''),
          entityType: org?.entity_type === 'school' ? 'school' : 'company',
        });
        setResolvedUserId(user.id);
        setLoading(false);
        return;
      }
    }

    setMembership(null);
    setResolvedUserId(user.id);
    setLoading(false);
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
