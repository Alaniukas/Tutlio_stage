import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useOrgAdminAccess } from '@/contexts/OrgAdminAccessContext';
import type { OrgAdminPermission } from '@/lib/orgAdminPermissions';
import { LockKeyhole } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

interface OrgPermissionRouteProps {
  permission?: OrgAdminPermission;
  editPermission?: OrgAdminPermission;
  ownerOnly?: boolean;
  children: ReactNode;
}

export default function OrgPermissionRoute({
  permission,
  editPermission,
  ownerOnly = false,
  children,
}: OrgPermissionRouteProps) {
  const location = useLocation();
  const { t } = useTranslation();
  const { loading, membership, isOwner, can, firstAllowedPath } = useOrgAdminAccess();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  const allowed = Boolean(
    membership
    && (!ownerOnly || isOwner)
    && (!permission || can(permission)),
  );
  if (allowed) {
    const readOnly = Boolean(editPermission && !can(editPermission));
    return (
      <>
        {readOnly ? (
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
            <LockKeyhole className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold">{t('orgTeam.readOnlyTitle')}</p>
              <p className="text-xs text-amber-800">{t('orgTeam.readOnlyDescription')}</p>
            </div>
          </div>
        ) : null}
        {children}
      </>
    );
  }

  const base = location.pathname === '/school' || location.pathname.startsWith('/school/')
    ? '/school'
    : '/company';
  return <Navigate to={firstAllowedPath(base)} replace />;
}
