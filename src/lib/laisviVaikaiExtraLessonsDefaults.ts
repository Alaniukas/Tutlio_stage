/**
 * VšĮ Laisvi vaikai — extra-lessons prefill defaults (prod order snapshots).
 * Grupinė: 6 €/užsiėmimas; individuali: 20 €/užsiėmimas.
 */

/** Keep in sync with LAISVI_VAIKIAI_ORG_ID in marketMoney.ts */
export const LAISVI_VAIKIAI_ORG_ID = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';

/** Keep in sync with DEMO_MOKYKLA_ORG_ID in marketMoney.ts */
export const DEMO_MOKYKLA_ORG_ID = 'c3a00000-7e57-4000-8000-000000000001';

export const LAISVI_VAIKIAI_EXTRA_GROUP_UNIT_EUR = 6;
export const LAISVI_VAIKIAI_EXTRA_INDIVIDUAL_UNIT_EUR = 20;
export const LAISVI_VAIKIAI_EXTRA_PLATFORM = 'Google Meet';
export const LAISVI_VAIKIAI_EXTRA_DURATION_MINUTES = 45;

export function isLaisviVaikaiOrg(organizationId: string | null | undefined): boolean {
  return organizationId === LAISVI_VAIKIAI_ORG_ID;
}

/**
 * Orgs that use Laisvi vaikai-style extra-lessons defaults (platform, duration, €/užsiėmimas).
 * Demo Mokykla — full QA sandbox; Laisvi vaikai — prod org with the same defaults.
 */
export function usesLaisviStyleExtraLessonsPrefill(organizationId: string | null | undefined): boolean {
  return isLaisviVaikaiOrg(organizationId) || organizationId === DEMO_MOKYKLA_ORG_ID;
}

/** Alias for UI/API checks: Demo + Laisvi extra-lessons QA behavior. */
export const isExtraLessonsQaOrg = usesLaisviStyleExtraLessonsPrefill;

export function laisviVaikaiExtraUnitPriceEur(serviceType: 'group' | 'individual' | '' | undefined): number {
  if (serviceType === 'individual') return LAISVI_VAIKIAI_EXTRA_INDIVIDUAL_UNIT_EUR;
  return LAISVI_VAIKIAI_EXTRA_GROUP_UNIT_EUR;
}
