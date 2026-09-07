import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { setLastPortal } from '@/lib/pwaPortal';
import { useOrgAdminAccess } from '@/contexts/OrgAdminAccessContext';

export default function CompanyProtectedRoute() {
  const location = useLocation();
  const { loading, membership } = useOrgAdminAccess();
  const onSchoolPortal =
    location.pathname === '/school' ||
    location.pathname.startsWith('/school/');
  const loginPath = onSchoolPortal ? '/school/login' : '/company/login';

  // Remember the portal so a logged-out installed PWA opens the right login.
  useEffect(() => {
    if (membership) setLastPortal(onSchoolPortal ? 'school' : 'company');
  }, [membership, onSchoolPortal]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f4f5f9] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return membership ? <Outlet /> : <Navigate to={loginPath} replace />;
}
