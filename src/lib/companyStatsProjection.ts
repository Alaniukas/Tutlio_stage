import { sumOrgTutorLessonsPayEur } from '@/lib/orgTutorLessonPay';
import { PRO_KLASE_TRIAL_PAY_EUR, proKlaseIndividualRatePayEur } from '@/lib/proKlaseTutorPay';
import type { StatsPeriodMode } from '@/lib/statsDateRange';

export type ProjectableOrgSession = {
  status?: string | null;
  start_time?: string | null;
  price?: number | null;
  is_complimentary?: boolean | null;
  exclude_from_lesson_count?: boolean | null;
  subject_id?: string | null;
  tutor_pay_eur_snapshot?: number | null;
  subjects?: { is_trial?: boolean | null } | Array<{ is_trial?: boolean | null }> | null;
};

export function plannedOrgSessionRevenue(session: ProjectableOrgSession): number {
  if (session.is_complimentary === true) return 0;
  const price = Number(session.price);
  return Number.isFinite(price) ? price : 0;
}

export function isPlannedOrgSession(
  session: ProjectableOrgSession,
  range: { startIso: string; endIso: string },
  mode: StatsPeriodMode,
  now: Date = new Date(),
): boolean {
  if (mode === 'historical') return false;
  const status = String(session.status || '');
  if (status === 'cancelled' || status === 'canceled') return false;
  if (status !== 'active') return false;
  if (session.exclude_from_lesson_count === true) return false;

  const startMs = Date.parse(String(session.start_time || ''));
  if (!Number.isFinite(startMs)) return false;
  const rangeStartMs = Date.parse(range.startIso);
  const rangeEndMs = Date.parse(range.endIso);
  if (startMs < rangeStartMs || startMs > rangeEndMs) return false;

  if (mode === 'forward') return true;
  return startMs > now.getTime();
}

export function filterPlannedOrgSessions(
  sessions: ProjectableOrgSession[],
  range: { startIso: string; endIso: string },
  mode: StatsPeriodMode,
  now: Date = new Date(),
): ProjectableOrgSession[] {
  return sessions.filter((session) => isPlannedOrgSession(session, range, mode, now));
}

export function sumPlannedOrgSessionRevenue(sessions: ProjectableOrgSession[]): number {
  return Math.round(
    sessions.reduce((sum, session) => sum + plannedOrgSessionRevenue(session), 0) * 100,
  ) / 100;
}

export function sumPlannedOrgTutorPayEur(
  sessions: ProjectableOrgSession[],
  opts: {
    organizationId?: string | null;
    defaultRate?: number | null;
    bySubject?: unknown;
    proKlase?: boolean;
  },
): number {
  if (opts.proKlase) {
    const rate = Number(opts.defaultRate) || 0;
    return Math.round(
      sessions.reduce((sum, session) => {
        const subject = Array.isArray(session.subjects) ? session.subjects[0] : session.subjects;
        if (subject?.is_trial) return sum + PRO_KLASE_TRIAL_PAY_EUR;
        return sum + proKlaseIndividualRatePayEur(rate);
      }, 0) * 100,
    ) / 100;
  }

  return sumOrgTutorLessonsPayEur(
    sessions,
    opts.defaultRate,
    opts.bySubject,
    opts.organizationId,
  );
}

export function summarizePlannedOrgTutorPay(
  sessions: ProjectableOrgSession[],
  opts: {
    organizationId?: string | null;
    defaultRate?: number | null;
    bySubject?: unknown;
    proKlase?: boolean;
  },
): { plannedSessions: number; projectedRevenue: number; projectedNetEarnings: number; projectedCompanyCommission: number } {
  const plannedSessions = sessions.length;
  const projectedRevenue = sumPlannedOrgSessionRevenue(sessions);
  const projectedNetEarnings = sumPlannedOrgTutorPayEur(sessions, opts);
  const projectedCompanyCommission = Math.round((projectedRevenue - projectedNetEarnings) * 100) / 100;
  return {
    plannedSessions,
    projectedRevenue,
    projectedNetEarnings,
    projectedCompanyCommission,
  };
}
