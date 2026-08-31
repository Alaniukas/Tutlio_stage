import { describe, expect, it } from 'vitest';
import {
  getFeaturesByCategoryForOrg,
  isProKlaseOnlyFeature,
  proKlaseFeatureEnabled,
  proKlaseFeatureEnabledForOrgRecord,
  proKlaseOrgAdminContext,
  stripProKlaseOnlyFeatures,
} from '@/lib/orgIntakeMode';
import { PRO_KLASE_ORG_ID, PRO_KLASE_QA_ORG_ID } from '@/lib/marketMoney';

describe('orgIntakeMode Pro Klasė gating', () => {
  const proKlaseOrgId = PRO_KLASE_QA_ORG_ID;
  const otherOrgId = '00000000-0000-4000-8000-000000000099';
  const hasStudentCardBooking = (id: string) => id === 'student_card_booking';

  it('blocks school orgs even when flags are on', () => {
    expect(proKlaseOrgAdminContext(proKlaseOrgId, 'school', false)).toBe(false);
    expect(
      proKlaseFeatureEnabledForOrgRecord(proKlaseOrgId, 'school', { student_card_booking: true }, 'student_card_booking'),
    ).toBe(false);
  });

  it('requires Pro Klasė org id for scoped flags on company orgs', () => {
    expect(proKlaseFeatureEnabled(otherOrgId, 'company', hasStudentCardBooking, 'student_card_booking')).toBe(
      false,
    );
    expect(proKlaseFeatureEnabled(proKlaseOrgId, 'company', hasStudentCardBooking, 'student_card_booking')).toBe(
      true,
    );
  });

  it('isProKlaseOnlyFeature identifies Pro Klasė registry entries', () => {
    expect(isProKlaseOnlyFeature('student_card_booking')).toBe(true);
    expect(isProKlaseOnlyFeature('disable_student_booking')).toBe(false);
    expect(isProKlaseOnlyFeature('school_class_groups')).toBe(false);
  });

  it('getFeaturesByCategoryForOrg hides Pro Klasė flags for generic orgs', () => {
    const generic = getFeaturesByCategoryForOrg(otherOrgId);
    const allIds = Object.values(generic).flat().map((f) => f.id);
    expect(allIds).not.toContain('student_card_booking');
    expect(allIds).toContain('disable_student_booking');
  });

  it('getFeaturesByCategoryForOrg shows Pro Klasė flags for Pro Klasė org', () => {
    const pro = getFeaturesByCategoryForOrg(proKlaseOrgId);
    const allIds = Object.values(pro).flat().map((f) => f.id);
    expect(allIds).toContain('student_card_booking');
  });

  it('stripProKlaseOnlyFeatures removes flags from non–Pro Klasė saves', () => {
    const stripped = stripProKlaseOnlyFeatures(otherOrgId, {
      disable_student_booking: true,
      student_card_booking: true,
    });
    expect(stripped.disable_student_booking).toBe(true);
    expect(stripped.student_card_booking).toBeUndefined();
  });

  it('stripProKlaseOnlyFeatures keeps flags for Pro Klasė org', () => {
    const kept = stripProKlaseOnlyFeatures(PRO_KLASE_ORG_ID, { student_card_booking: true });
    expect(kept.student_card_booking).toBe(true);
  });
});
