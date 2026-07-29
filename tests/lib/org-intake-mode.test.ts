import { describe, expect, it } from 'vitest';
import {
  hasProKlaseIntakeFeatures,
  isSchoolOrg,
  showDynamicPricingNav,
} from '../../src/lib/orgIntakeMode';

describe('orgIntakeMode', () => {
  it('isSchoolOrg identifies school entity type only', () => {
    expect(isSchoolOrg('school')).toBe(true);
    expect(isSchoolOrg('company')).toBe(false);
  });

  it('showDynamicPricingNav is false for school and plain company', () => {
    const noFlags = () => false;
    expect(showDynamicPricingNav('school', noFlags)).toBe(false);
    expect(showDynamicPricingNav('company', noFlags)).toBe(false);
  });

  it('showDynamicPricingNav is true for company with Pro Klasė intake flags', () => {
    const flags = new Set(['monthly_packages']);
    expect(showDynamicPricingNav('company', (id) => flags.has(id))).toBe(true);
  });

  it('hasProKlaseIntakeFeatures detects any intake flag', () => {
    expect(hasProKlaseIntakeFeatures(() => false)).toBe(false);
    expect(hasProKlaseIntakeFeatures((id) => id === 'trial_reservation_flow')).toBe(true);
  });
});
