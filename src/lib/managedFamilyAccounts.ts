import { isMoksloVaisiaiOrg, isProKlaseOrg } from './marketMoney.js';

export const MANAGED_FAMILY_ACCOUNTS_FEATURE_ID = 'managed_family_accounts';

/**
 * Managed family accounts started as an MV-specific workflow, but the feature
 * is portable. Legacy organizations remain enabled by identity; every other
 * organization opts in with a flag and must use its own active branding.
 */
export function managedFamilyAccountsEnabled(
  organizationId: string | null | undefined,
  features: Record<string, unknown> | null | undefined,
): boolean {
  if (isMoksloVaisiaiOrg(organizationId) || isProKlaseOrg(organizationId)) return true;
  return features?.[MANAGED_FAMILY_ACCOUNTS_FEATURE_ID] === true;
}

/** Brand-neutral prefix for organizations that adopted the portable feature. */
export function managedStudentLoginPrefix(
  organizationId: string | null | undefined,
): 'mv' | 'pk' | 'st' {
  if (isProKlaseOrg(organizationId)) return 'pk';
  if (isMoksloVaisiaiOrg(organizationId)) return 'mv';
  return 'st';
}
