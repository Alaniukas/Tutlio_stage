import type { OrgEntityType } from '@/contexts/OrgEntityContext';

/** Traditional school org (contracts, installments, school parent flows). Not Pro Klasė. */
export function isSchoolOrg(entityType: OrgEntityType): boolean {
  return entityType === 'school';
}

/**
 * Pro Klasė intake funnel flags — enabled on **company** orgs (entity_type = company).
 * School orgs use separate logic and must not inherit these UI paths.
 */
export const PRO_KLASE_INTAKE_FEATURE_IDS = [
  'tutor_frequency_search',
  'trial_reservation_flow',
  'trial_followup_alert',
  'package_reservation_flow',
  'monthly_packages',
  'student_schedule_overview',
  'student_card_booking',
  'auto_trial_first_lesson',
] as const;

export function hasProKlaseIntakeFeatures(hasFeature: (id: string) => boolean): boolean {
  return PRO_KLASE_INTAKE_FEATURE_IDS.some((id) => hasFeature(id));
}

/** Dinaminė kainodara ir susijęs nav — tik company Pro Klasė, ne school. */
export function showDynamicPricingNav(
  entityType: OrgEntityType,
  hasFeature: (id: string) => boolean,
): boolean {
  if (isSchoolOrg(entityType)) return false;
  return hasProKlaseIntakeFeatures(hasFeature);
}
