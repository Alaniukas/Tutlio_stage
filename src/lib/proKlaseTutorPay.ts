import { orgTutorLessonPayEur } from '@/lib/orgTutorLessonPay';

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

export type ProKlasePayBreakdown = {
  individualLessons: number;
  individualEur: number;
  trialLessons: number;
  trialEur: number;
  noShowLessons: number;
  noShowEur: number;
  adjustmentsEur: number;
  totalEur: number;
};

export function sumProKlasePayBreakdown(
  sessions: Array<ProKlaseSessionPayInput & { id?: string }>,
  tutorPayRate: number | null | undefined,
  adjustmentsEur = 0,
): ProKlasePayBreakdown {
  let individualLessons = 0;
  let individualEur = 0;
  let trialLessons = 0;
  let trialEur = 0;
  let noShowLessons = 0;
  let noShowEur = 0;

  for (const s of sessions) {
    const pay = proKlaseSessionPayEur(s, tutorPayRate);
    if (pay <= 0) continue;
    if (s.status === 'no_show') {
      noShowLessons += 1;
      noShowEur += pay;
    } else if (s.subjects?.is_trial) {
      trialLessons += 1;
      trialEur += pay;
    } else {
      individualLessons += 1;
      individualEur += pay;
    }
  }

  const earnings = individualEur + trialEur + noShowEur;
  return {
    individualLessons,
    individualEur,
    trialLessons,
    trialEur,
    noShowLessons,
    noShowEur,
    adjustmentsEur,
    totalEur: Math.round((earnings + adjustmentsEur) * 100) / 100,
  };
}
