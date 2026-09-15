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
  /** Tutor/admin must stamp the outcome before pay is realized. */
  status_confirmed_at?: string | Date | null;
  price?: number | null;
  is_complimentary?: boolean | null;
  subjects?: { is_trial?: boolean | null } | Array<{ is_trial?: boolean | null }> | null;
};

type ProKlaseSessionCountInput = {
  status?: string | null;
  status_confirmed_at?: string | Date | null;
  exclude_from_lesson_count?: boolean | null;
};

export function hasProKlaseOutcomeConfirmation(
  session: { status_confirmed_at?: string | Date | null },
): boolean {
  const stamp = session.status_confirmed_at;
  if (stamp == null || stamp === '') return false;
  if (stamp instanceof Date) return Number.isFinite(stamp.getTime());
  return String(stamp).trim().length > 0;
}

/** Ended Pro Klasė lesson that still needs the tutor to mark attended / no-show. */
export function isProKlaseAwaitingOutcomeConfirmation(
  session: {
    status?: string | null;
    end_time?: string | Date | null;
    status_confirmed_at?: string | Date | null;
  },
  now: Date = new Date(),
): boolean {
  const status = String(session.status || '');
  if (status === 'cancelled' || status === 'canceled') return false;
  if (hasProKlaseOutcomeConfirmation(session)) return false;
  const end = session.end_time ? new Date(session.end_time) : null;
  if (!end || !Number.isFinite(end.getTime()) || end.getTime() > now.getTime()) return false;
  return true;
}

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

export function isProKlaseRealizedSession(
  session: { status?: string | null; status_confirmed_at?: string | Date | null },
): boolean {
  const status = String(session.status || '');
  return (status === 'completed' || status === 'no_show') && hasProKlaseOutcomeConfirmation(session);
}

export function countProKlaseConfirmedCompleted(
  sessions: ProKlaseSessionCountInput[],
): number {
  return sessions.filter(
    (s) => s.exclude_from_lesson_count !== true
      && String(s.status || '') === 'completed'
      && hasProKlaseOutcomeConfirmation(s),
  ).length;
}

export function countProKlaseConfirmedNoShows(
  sessions: ProKlaseSessionCountInput[],
): number {
  return sessions.filter(
    (s) => s.exclude_from_lesson_count !== true
      && String(s.status || '') === 'no_show'
      && hasProKlaseOutcomeConfirmation(s),
  ).length;
}

export function proKlaseSessionPayEur(
  session: ProKlaseSessionPayInput,
  tutorPayRate: number | null | undefined,
): number {
  const normalized = normalizeProKlaseSessionForPay(session);
  // Complimentary is a client-side discount; the tutor still earns the normal rate.
  if (!hasProKlaseOutcomeConfirmation(normalized)) return 0;
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
      .filter((s) => isProKlaseRealizedSession(s))
      .reduce((sum, s) => sum + proKlaseSessionPayEur(s, tutorPayRate), 0) * 100,
  ) / 100;
}

export function countProKlaseRealizedSessions(
  sessions: ProKlaseSessionCountInput[],
): number {
  return sessions.filter(
    (s) => s.exclude_from_lesson_count !== true && isProKlaseRealizedSession(s),
  ).length;
}
