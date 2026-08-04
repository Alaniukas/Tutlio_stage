function orgTutorLessonPayEur(
  tutorPayRate: number | null | undefined,
  sessionPrice: number | null | undefined,
): number {
  const rate = Number(tutorPayRate);
  if (Number.isFinite(rate) && rate > 0) return rate;
  const price = Number(sessionPrice);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

export const PRO_KLASE_TRIAL_PAY_EUR = 10;
export const PRO_KLASE_STUDENT_NO_SHOW_PAY_EUR = 6;
export const PRO_KLASE_TUTOR_NO_SHOW_PENALTY_EUR = -30;
export const PRO_KLASE_MISSING_REPORT_PENALTY_EUR = -10;

export type ProKlaseSessionPayInput = {
  status: string;
  price?: number | null;
  subjects?: { is_trial?: boolean | null } | null;
};

export function proKlaseSessionPayEur(
  session: ProKlaseSessionPayInput,
  tutorPayRate: number | null | undefined,
): number {
  if (session.status === 'no_show') return PRO_KLASE_STUDENT_NO_SHOW_PAY_EUR;
  if (session.status === 'completed') {
    if (session.subjects?.is_trial) return PRO_KLASE_TRIAL_PAY_EUR;
    return orgTutorLessonPayEur(tutorPayRate, session.price);
  }
  return 0;
}
