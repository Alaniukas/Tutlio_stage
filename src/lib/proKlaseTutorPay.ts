import { isComplimentarySession } from '@/lib/sessionComplimentary';

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

export function normalizeProKlaseSubject(
  subjects: ProKlaseSessionPayInput['subjects'],
): { is_trial?: boolean | null } | null {
  if (!subjects) return null;
  if (Array.isArray(subjects)) return subjects[0] ?? null;
  return subjects;
}

/** Pro Klasė individual lesson pay: tutor rate only (never client session.price). */
export function proKlaseIndividualRatePayEur(tutorPayRate: number | null | undefined): number {
  const rate = Number(tutorPayRate);
  return Number.isFinite(rate) && rate > 0 ? rate : 0;
}

export function normalizeProKlaseSessionForPay(
  session: ProKlaseSessionPayInput,
): ProKlaseSessionPayInput & { subjects: { is_trial?: boolean | null } | null } {
  return {
    ...session,
    subjects: normalizeProKlaseSubject(session.subjects),
  };
}

export function isProKlaseRealizedSession(status: string): boolean {
  return status === 'completed' || status === 'no_show';
}

export function proKlaseSessionPayEur(
  session: ProKlaseSessionPayInput,
  tutorPayRate: number | null | undefined,
): number {
  const normalized = normalizeProKlaseSessionForPay(session);
  if (isComplimentarySession(normalized)) return 0;
  if (normalized.status === 'no_show') return PRO_KLASE_STUDENT_NO_SHOW_PAY_EUR;
  if (normalized.status === 'completed') {
    if (normalized.subjects?.is_trial) return PRO_KLASE_TRIAL_PAY_EUR;
    return proKlaseIndividualRatePayEur(tutorPayRate);
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

  for (const raw of sessions) {
    const s = normalizeProKlaseSessionForPay(raw);
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

export function sumProKlaseRealizedPayEur(
  sessions: ProKlaseSessionPayInput[],
  tutorPayRate: number | null | undefined,
): number {
  return Math.round(
    sessions
      .filter((s) => isProKlaseRealizedSession(String(s.status || '')))
      .reduce((sum, s) => sum + proKlaseSessionPayEur(s, tutorPayRate), 0) * 100,
  ) / 100;
}

export function countProKlaseRealizedSessions(sessions: Array<{ status?: string | null }>): number {
  return sessions.filter((s) => isProKlaseRealizedSession(String(s.status || ''))).length;
}
