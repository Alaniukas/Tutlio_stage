import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { recordOrgAdminNavigation, startOrgAdminTelemetry } from '@/lib/orgAdminTelemetry';

export function useOrgAdminTelemetry(userId: string | undefined, organizationId: string | undefined): void {
  const location = useLocation();
  useEffect(() => {
    if (!userId || !organizationId) return;
    return startOrgAdminTelemetry({ userId, organizationId, enabled: import.meta.env.PROD, release: import.meta.env.VITE_APP_RELEASE });
  }, [userId, organizationId]);
  useEffect(() => { recordOrgAdminNavigation(location.pathname); }, [location.pathname, location.search]);
}
