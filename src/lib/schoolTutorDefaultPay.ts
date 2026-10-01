import {
  DEMO_MOKYKLA_ORG_ID,
  isStaffDocumentsOrg,
  LAISVI_VAIKIAI_ORG_ID,
} from './marketMoney.js';

/** Canonical school teacher pay (EUR / conducted meeting) for Laisvi vaikai and Demo Mokykla QA. */
export const LAISVI_VAIKIAI_DEFAULT_TUTOR_PAY_EUR = 45;

const CANONICAL_PAY_ORG_IDS = new Set([LAISVI_VAIKIAI_ORG_ID, DEMO_MOKYKLA_ORG_ID]);

function positiveRate(value: number | null | undefined): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : null;
}

export function schoolOrgCanonicalTutorPayEur(orgIdOrSlug?: string | null): number | null {
  if (!orgIdOrSlug) return null;
  const key = orgIdOrSlug.trim().toLowerCase();
  if (CANONICAL_PAY_ORG_IDS.has(key) || isStaffDocumentsOrg(key)) {
    return LAISVI_VAIKIAI_DEFAULT_TUTOR_PAY_EUR;
  }
  return null;
}

/** Group meeting rate: explicit tutor rate, else org default, else Laisvi/Demo canonical 45 €. */
export function resolveSchoolTutorGroupPayRate(options: {
  tutorRate?: number | null;
  orgDefaultRate?: number | null;
  organizationId?: string | null;
}): number | null {
  return positiveRate(options.tutorRate)
    ?? positiveRate(options.orgDefaultRate)
    ?? schoolOrgCanonicalTutorPayEur(options.organizationId);
}

/** Individual meetings inherit the group rate unless a positive individual override exists. */
export function resolveSchoolTutorIndividualPayRate(options: {
  individualRate?: number | null;
  groupRate: number | null;
}): number | null {
  return positiveRate(options.individualRate) ?? options.groupRate;
}
