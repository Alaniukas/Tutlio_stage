import { useOrgFeatures } from '@/hooks/useOrgFeatures';
import { isWaitlistHiddenForOrg } from '@/lib/marketMoney';

type UseHideWaitlistOptions = {
  /**
   * Company admin / org-tutor surfaces: while features are still loading, treat
   * waitlist as hidden so Pro Klasė never flashes the link/page then removes it.
   */
  failClosedWhileLoading?: boolean;
};

/**
 * Single source of truth for "is waitlist allowed in this UI".
 * Prefer this over ad-hoc hasFeature + isWaitlistHiddenForOrg checks.
 */
export function useHideWaitlist(options: UseHideWaitlistOptions = {}) {
  const { failClosedWhileLoading = false } = options;
  const { loading, organizationId, hasFeature } = useOrgFeatures();

  const hideWaitlist =
    (failClosedWhileLoading && loading) ||
    hasFeature('disable_waitlist') ||
    isWaitlistHiddenForOrg(organizationId);

  return {
    hideWaitlist,
    /** True once org features finished resolving (success or no-org). */
    resolved: !loading,
    organizationId,
  };
}
