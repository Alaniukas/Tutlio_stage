import { describe, expect, it } from 'vitest';
import {
  DEMO_MOKYKLA_ORG_ID,
  LAISVI_VAIKIAI_ORG_ID,
} from '../../src/lib/marketMoney';
import {
  LAISVI_VAIKIAI_DEFAULT_TUTOR_PAY_EUR,
  resolveSchoolTutorGroupPayRate,
  resolveSchoolTutorIndividualPayRate,
  schoolOrgCanonicalTutorPayEur,
} from '../../src/lib/schoolTutorDefaultPay';

describe('schoolTutorDefaultPay', () => {
  it('uses 45 EUR canonical default for Laisvi vaikai and Demo Mokykla', () => {
    expect(schoolOrgCanonicalTutorPayEur(LAISVI_VAIKIAI_ORG_ID)).toBe(45);
    expect(schoolOrgCanonicalTutorPayEur(DEMO_MOKYKLA_ORG_ID)).toBe(45);
    expect(schoolOrgCanonicalTutorPayEur('other-org')).toBeNull();
  });

  it('prefers explicit tutor rate over org default and canonical fallback', () => {
    expect(resolveSchoolTutorGroupPayRate({
      tutorRate: 50,
      orgDefaultRate: 45,
      organizationId: LAISVI_VAIKIAI_ORG_ID,
    })).toBe(50);
    expect(resolveSchoolTutorGroupPayRate({
      tutorRate: 0,
      orgDefaultRate: 45,
      organizationId: LAISVI_VAIKIAI_ORG_ID,
    })).toBe(45);
    expect(resolveSchoolTutorGroupPayRate({
      tutorRate: null,
      orgDefaultRate: null,
      organizationId: LAISVI_VAIKIAI_ORG_ID,
    })).toBe(LAISVI_VAIKIAI_DEFAULT_TUTOR_PAY_EUR);
  });

  it('falls back individual lessons to the resolved group rate', () => {
    expect(resolveSchoolTutorIndividualPayRate({
      individualRate: null,
      groupRate: 45,
    })).toBe(45);
    expect(resolveSchoolTutorIndividualPayRate({
      individualRate: 55,
      groupRate: 45,
    })).toBe(55);
  });
});
