import {
  DEMO_MOKYKLA_ORG_ID,
  DEMO_MOKYKLA_SLUG,
  LAISVI_VAIKIAI_ORG_ID,
  LAISVI_VAIKIAI_SLUG,
} from './marketMoney.js';

export const SCHOOL_CONSULTATIONS_FEATURE = 'school_consultations' as const;

export function isSchoolConsultationsOrg(orgIdOrSlug?: string | null): boolean {
  if (!orgIdOrSlug) return false;
  const key = orgIdOrSlug.trim().toLowerCase();
  return (
    key === LAISVI_VAIKIAI_ORG_ID ||
    key === LAISVI_VAIKIAI_SLUG ||
    key === DEMO_MOKYKLA_ORG_ID ||
    key === DEMO_MOKYKLA_SLUG
  );
}

export function hasSchoolConsultationsFeature(
  features: Record<string, unknown> | null | undefined,
  orgIdOrSlug?: string | null,
): boolean {
  if (!isSchoolConsultationsOrg(orgIdOrSlug)) return false;
  return Boolean(features?.[SCHOOL_CONSULTATIONS_FEATURE]);
}

export function schoolConsultationsEnabled(
  orgIdOrSlug: string | null | undefined,
  features: Record<string, unknown> | null | undefined,
): boolean {
  return isSchoolConsultationsOrg(orgIdOrSlug) && hasSchoolConsultationsFeature(features, orgIdOrSlug);
}

/** Discount addenda can accompany extra-lessons offers, independently of consultations. */
export function schoolExtraLessonsDiscountEnabled(
  orgIdOrSlug: string | null | undefined,
  features: Record<string, unknown> | null | undefined,
): boolean {
  return isSchoolConsultationsOrg(orgIdOrSlug) && features?.school_extra_lessons_contract === true;
}

/** Parent S.F. for conducted lessons: extra-lessons schools, family portal, or consultations. */
export function schoolMonthlyInvoicesEnabled(
  orgIdOrSlug: string | null | undefined,
  features: Record<string, unknown> | null | undefined,
  entityType?: string | null,
): boolean {
  if (entityType && entityType !== 'school') return false;
  return schoolConsultationsEnabled(orgIdOrSlug, features)
    || schoolExtraLessonsDiscountEnabled(orgIdOrSlug, features)
    || Boolean(features?.school_family_portal);
}
