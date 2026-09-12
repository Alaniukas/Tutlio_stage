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
