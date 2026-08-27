import { isComplimentarySession, sessionClientRevenueEur } from '@/lib/sessionComplimentary';
import {
  PRO_KLASE_STUDENT_NO_SHOW_PAY_EUR,
  PRO_KLASE_TRIAL_PAY_EUR,
} from '@/lib/proKlaseTutorPay';
import { orgTutorLessonPayEur } from '@/lib/orgTutorLessonPay';

export type ProKlaseAdminSession = {
  status: string;
  payment_status?: string | null;
  paid?: boolean | null;
  price?: number | null;
  is_complimentary?: boolean | null;
  lesson_package_id?: string | null;
  subjects?: { is_trial?: boolean | null } | null;
};

export type ProKlasePaidPackage = {
  tutor_id: string;
  total_price: number | null;
  paid?: boolean | null;
  payment_status?: string | null;
};

function isCancelled(status: string): boolean {
  return status === 'cancelled';
}

function isPaidLike(session: ProKlaseAdminSession): boolean {
  if (session.paid === true) return true;
  const ps = String(session.payment_status || '');
  return ps === 'paid' || ps === 'confirmed';
}

/** Expected tutor cost for a remaining (not cancelled) paid calendar lesson. */
export function proKlaseAccruedTutorCostEur(
  session: ProKlaseAdminSession,
  tutorPayRate: number | null | undefined,
): number {
  if (isCancelled(session.status)) return 0;
  if (isComplimentarySession(session)) return 0;
  if (!isPaidLike(session)) return 0;
  if (session.status === 'no_show') return PRO_KLASE_STUDENT_NO_SHOW_PAY_EUR;
  if (session.subjects?.is_trial) return PRO_KLASE_TRIAL_PAY_EUR;
  if (session.status === 'active' || session.status === 'completed') {
    return orgTutorLessonPayEur(tutorPayRate, session.price);
  }
  return 0;
}

export function packageClientPaidEur(pkg: ProKlasePaidPackage): number {
  if (pkg.paid === true || pkg.payment_status === 'paid' || pkg.payment_status === 'confirmed') {
    const n = Number(pkg.total_price);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export function standaloneSessionClientPaidEur(session: ProKlaseAdminSession): number {
  if (session.lesson_package_id) return 0;
  if (isCancelled(session.status)) return 0;
  if (!isPaidLike(session)) return 0;
  return sessionClientRevenueEur(session);
}

export function proKlaseAdminFinanceSplit(opts: {
  clientPaidEur: number;
  sessions: ProKlaseAdminSession[];
  tutorPayRate: number | null | undefined;
}): { clientPaidEur: number; accruedTutorCostEur: number; platformShareEur: number } {
  const accruedTutorCostEur = opts.sessions.reduce(
    (sum, session) => sum + proKlaseAccruedTutorCostEur(session, opts.tutorPayRate),
    0,
  );
  const clientPaidEur = Math.round(opts.clientPaidEur * 100) / 100;
  const tutorRounded = Math.round(accruedTutorCostEur * 100) / 100;
  return {
    clientPaidEur,
    accruedTutorCostEur: tutorRounded,
    platformShareEur: Math.round((clientPaidEur - tutorRounded) * 100) / 100,
  };
}
