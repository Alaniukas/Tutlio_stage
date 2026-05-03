import { useEffect, useState } from 'react';
import {
  orgSuspensionRowDeduped,
  rpcGetStudentByUserIdDeduped,
  tutorProfileOrgIdDeduped,
} from '@/lib/preload';
import { useUser } from '@/contexts/UserContext';

export interface OrgAccessState {
  loading: boolean;
  suspended: boolean;
  organizationId: string | null;
  /** Future feature flags; empty object until flags are added */
  features: Record<string, unknown>;
}

export function useOrgAccess(): OrgAccessState {
  const { user, profile } = useUser();
  const [state, setState] = useState<OrgAccessState>({
    loading: true,
    suspended: false,
    organizationId: null,
    features: {},
  });

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!user) {
        setState({ loading: false, suspended: false, organizationId: null, features: {} });
        return;
      }

      setState((s) => ({ ...s, loading: true }));

      const applyOrg = (orgId: string | null, orgRow: { status: string; features: unknown } | null) => {
        if (cancelled) return;
        const suspended = orgRow?.status === 'suspended';
        const features =
          orgRow?.features &&
          typeof orgRow.features === 'object' &&
          orgRow.features !== null &&
          !Array.isArray(orgRow.features)
            ? (orgRow.features as Record<string, unknown>)
            : {};
        setState({
          loading: false,
          suspended,
          organizationId: orgId,
          features,
        });
      };

      if (profile?.organization_id) {
        const { data: org } = await orgSuspensionRowDeduped(profile.organization_id);
        applyOrg(profile.organization_id, org);
        return;
      }

      const { data: studentRows, error } = await rpcGetStudentByUserIdDeduped(user.id);
      if (error || !studentRows?.length) {
        applyOrg(null, null);
        return;
      }

      const tutorId = (studentRows[0] as { tutor_id?: string })?.tutor_id;
      if (!tutorId) {
        applyOrg(null, null);
        return;
      }

      const { data: prof } = await tutorProfileOrgIdDeduped(tutorId);
      if (!prof?.organization_id) {
        applyOrg(null, null);
        return;
      }

      const { data: org } = await orgSuspensionRowDeduped(prof.organization_id);

      applyOrg(prof.organization_id, org);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [user?.id, profile?.organization_id]);

  return state;
}
