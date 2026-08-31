import type { OrgEntityType } from '@/contexts/OrgEntityContext';
import { FEATURE_REGISTRY, type FeatureDefinition } from '@/lib/featureRegistry';
import { isProKlaseOrg } from '@/lib/marketMoney';

/** Traditional school org (contracts, installments, school parent flows). Not Pro Klasė. */
export function isSchoolOrg(entityType: OrgEntityType | string | null | undefined): boolean {
  return entityType === 'school';
}

/**
 * Pro Klasė intake funnel flags — toggles in admin for Pro Klasė org only.
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

/** All feature IDs that belong to Pro Klasė product — hidden from other orgs in admin + UI. */
export const PRO_KLASE_ONLY_FEATURE_IDS = [
  ...PRO_KLASE_INTAKE_FEATURE_IDS,
  'student_availability_profile',
  'hide_admin_lesson_prices',
  'hide_trial_offer_button',
  'trial_creation_payment_email',
  'post_trial_auto_package',
  'extra_lessons_billing',
  'student_payments_page',
] as const;

export type ProKlaseOnlyFeatureId = (typeof PRO_KLASE_ONLY_FEATURE_IDS)[number];

const PRO_KLASE_ONLY_SET = new Set<string>(PRO_KLASE_ONLY_FEATURE_IDS);

export function isProKlaseOnlyFeature(featureId: string): boolean {
  return PRO_KLASE_ONLY_SET.has(featureId);
}

/** @deprecated Prefer isProKlaseOrg(orgId) — intake flags alone must not unlock Pro Klasė UI. */
export function hasProKlaseIntakeFeatures(hasFeature: (id: string) => boolean): boolean {
  return PRO_KLASE_INTAKE_FEATURE_IDS.some((id) => hasFeature(id));
}

/** @deprecated Prefer isProKlaseOrg(orgId). */
export function orgFeaturesHasProKlaseIntake(
  features: Record<string, unknown> | null | undefined,
): boolean {
  const f = features && typeof features === 'object' && !Array.isArray(features) ? features : {};
  return PRO_KLASE_INTAKE_FEATURE_IDS.some((id) => f[id] === true);
}

/** Company Pro Klasė org admin UI (not school, not generic company). */
export function proKlaseOrgAdminContext(
  orgId: string | null | undefined,
  entityType: OrgEntityType | string | null | undefined,
  featuresLoading = false,
): boolean {
  if (isSchoolOrg(entityType) || featuresLoading) return false;
  return isProKlaseOrg(orgId);
}

/** Pro Klasė-only flag: Pro Klasė org + flag on. */
export function proKlaseFeatureEnabled(
  orgId: string | null | undefined,
  entityType: OrgEntityType | string | null | undefined,
  hasFeature: (id: string) => boolean,
  flagId: string,
  featuresLoading = false,
): boolean {
  return proKlaseOrgAdminContext(orgId, entityType, featuresLoading) && hasFeature(flagId);
}

/** Server-side: org row + feature id (API/cron/policy). */
export function proKlaseFeatureEnabledForOrgRecord(
  orgId: string | null | undefined,
  entityType: string | null | undefined,
  features: Record<string, unknown> | null | undefined,
  flagId: string,
): boolean {
  if (entityType === 'school') return false;
  if (!isProKlaseOrg(orgId)) return false;
  const f = features && typeof features === 'object' && !Array.isArray(features) ? features : {};
  return f[flagId] === true;
}

/** Remove Pro Klasė-only flags when saving a non–Pro Klasė org (admin hygiene). */
export function stripProKlaseOnlyFeatures(
  orgId: string | null | undefined,
  features: Record<string, unknown>,
): Record<string, unknown> {
  if (isProKlaseOrg(orgId)) return features;
  const out = { ...features };
  for (const id of PRO_KLASE_ONLY_FEATURE_IDS) {
    delete out[id];
  }
  return out;
}

/** Dinaminė kainodara nav — tik Pro Klasė company org. */
export function showDynamicPricingNav(
  orgId: string | null | undefined,
  entityType: OrgEntityType | string | null | undefined,
): boolean {
  return proKlaseOrgAdminContext(orgId, entityType, false);
}

/** Admin panel: hide Pro Klasė-only toggles for non–Pro Klasė orgs. */
export function getFeaturesByCategoryForOrg(orgId: string | null | undefined) {
  const grouped: Record<string, FeatureDefinition[]> = {};
  const showProKlase = isProKlaseOrg(orgId);

  Object.values(FEATURE_REGISTRY).forEach((feature) => {
    if (!showProKlase && isProKlaseOnlyFeature(feature.id)) return;
    if (!grouped[feature.category]) grouped[feature.category] = [];
    grouped[feature.category].push(feature);
  });

  return grouped;
}
