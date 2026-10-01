import { describe, expect, it } from 'vitest';
import { DEMO_MOKYKLA_ORG_ID, LAISVI_VAIKIAI_ORG_ID } from '../../src/lib/marketMoney';
import { schoolConsultationsEnabled, schoolMonthlyInvoicesEnabled } from '../../src/lib/schoolConsultationsOrg';

describe('school monthly invoice access', () => {
  it('lets extra-lessons schools issue parent invoices without the consultations flag', () => {
    const features = { school_extra_lessons_contract: true };
    expect(schoolConsultationsEnabled(LAISVI_VAIKIAI_ORG_ID, features)).toBe(false);
    expect(schoolMonthlyInvoicesEnabled(LAISVI_VAIKIAI_ORG_ID, features, 'school')).toBe(true);
    expect(schoolMonthlyInvoicesEnabled(DEMO_MOKYKLA_ORG_ID, features, 'school')).toBe(true);
    expect(schoolMonthlyInvoicesEnabled(LAISVI_VAIKIAI_ORG_ID, features, 'company')).toBe(false);
    expect(schoolMonthlyInvoicesEnabled('other-org', features, 'school')).toBe(false);
  });
});
