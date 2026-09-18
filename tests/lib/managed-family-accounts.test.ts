import { describe, expect, it } from 'vitest';
import {
  managedFamilyAccountsEnabled,
  managedStudentLoginPrefix,
} from '@/lib/managedFamilyAccounts';
import { MOKSLO_VAISIAI_ORG_ID, PRO_KLASE_ORG_ID } from '@/lib/marketMoney';

describe('portable managed family accounts', () => {
  it('keeps legacy organizations enabled without a flag', () => {
    expect(managedFamilyAccountsEnabled(MOKSLO_VAISIAI_ORG_ID, {})).toBe(true);
    expect(managedFamilyAccountsEnabled(PRO_KLASE_ORG_ID, {})).toBe(true);
  });

  it('allows another organization only through the portable flag', () => {
    const orgId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expect(managedFamilyAccountsEnabled(orgId, {})).toBe(false);
    expect(managedFamilyAccountsEnabled(orgId, { managed_family_accounts: true })).toBe(true);
  });

  it('does not leak an origin-brand prefix to another organization', () => {
    expect(managedStudentLoginPrefix(MOKSLO_VAISIAI_ORG_ID)).toBe('mv');
    expect(managedStudentLoginPrefix(PRO_KLASE_ORG_ID)).toBe('pk');
    expect(managedStudentLoginPrefix('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe('st');
  });
});
