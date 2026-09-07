/** Fixed EUR pay for a completed trial lesson (Pro Klasė). */
export const PRO_KLASE_TRIAL_PAY_EUR = 10;

/** Fixed EUR pay when student no-shows (Pro Klasė). */
export const PRO_KLASE_STUDENT_NO_SHOW_PAY_EUR = 6;

/** Default penalty when tutor no-shows (Pro Klasė). */
export const PRO_KLASE_TUTOR_NO_SHOW_PENALTY_EUR = -30;

/** Default penalty when tutor misses post-lesson report (Pro Klasė). */
export const PRO_KLASE_MISSING_REPORT_PENALTY_EUR = -10;

export type ProKlaseSessionPayInput = {
  status: string;
  price?: number | null;
  is_complimentary?: boolean | null;
  subjects?: { is_trial?: boolean | null } | Array<{ is_trial?: boolean | null }> | null;
};

function isComplimentary(session: { is_complimentary?: boolean | null }): boolean {
  return session.is_complimentary === true;
}

export function normalizeProKlaseSubject(
  subjects: ProKlaseSessionPayInput['subjects'],
): { is_trial?: boolean | null } | null {
  if (!subjects) return null;
  if (Array.isArray(subjects)) return subjects[0] ?? null;
  return subjects;
}

function proKlaseIndividualRatePayEur(tutorPayRate: number | null | undefined): number {
  const rate = Number(tutorPayRate);
  return Number.isFinite(rate) && rate > 0 ? rate : 0;
}

export function proKlaseSessionPayEur(
  session: ProKlaseSessionPayInput,
  tutorPayRate: number | null | undefined,
): number {
  if (isComplimentary(session)) return 0;
  const subjects = normalizeProKlaseSubject(session.subjects);
  if (session.status === 'no_show') return PRO_KLASE_STUDENT_NO_SHOW_PAY_EUR;
  if (session.status === 'completed') {
    if (subjects?.is_trial) return PRO_KLASE_TRIAL_PAY_EUR;
    return proKlaseIndividualRatePayEur(tutorPayRate);
  }
  return 0;
}
