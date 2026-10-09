import {
  countProKlaseConfirmedCompleted,
  sumProKlasePayBreakdown,
  type ProKlasePayBreakdown,
  type ProKlaseSessionPayInput,
} from './proKlaseTutorPay.js';

export type TutorPayAdjustment = {
  id: string;
  tutor_id: string;
  session_id: string | null;
  type: 'penalty_tutor_no_show' | 'penalty_missing_report' | 'penalty_manual' | 'bonus_manual';
  amount_eur: number;
  reason: string | null;
  created_at: string;
};

export type ProKlaseFinanceTutor = {
  id: string;
  full_name: string;
  email: string | null;
  company_commission_percent: number | null;
};

export type ProKlaseFinanceSession = ProKlaseSessionPayInput & {
  tutor_id: string;
  exclude_from_lesson_count?: boolean | null;
};

export type ProKlaseTutorFinanceRow = {
  id: string;
  fullName: string;
  email: string | null;
  payRateEur: number | null;
  completedCount: number;
  breakdown: ProKlasePayBreakdown | null;
  adjustments: TutorPayAdjustment[];
};

export type TutorPayInvoice = {
  id: string;
  invoice_number: string;
  issue_date: string;
  period_start: string | null;
  period_end: string | null;
  total_amount: number;
  status: string;
  organization_id: string;
  pdf_meta?: unknown;
};

export type ProKlaseTutorFinanceResponse = {
  tutors: ProKlaseTutorFinanceRow[];
  invoices: TutorPayInvoice[];
};

/** Use the same realized pay rules as the tutor's own Finance screen. */
export function buildProKlaseTutorFinance(
  tutors: ProKlaseFinanceTutor[],
  sessions: ProKlaseFinanceSession[],
  adjustments: TutorPayAdjustment[],
): ProKlaseTutorFinanceRow[] {
  const sessionsByTutor = new Map<string, ProKlaseFinanceSession[]>();
  const adjustmentsByTutor = new Map<string, TutorPayAdjustment[]>();
  for (const session of sessions) {
    const rows = sessionsByTutor.get(session.tutor_id) ?? [];
    rows.push(session);
    sessionsByTutor.set(session.tutor_id, rows);
  }
  for (const adjustment of adjustments) {
    const rows = adjustmentsByTutor.get(adjustment.tutor_id) ?? [];
    rows.push({ ...adjustment, amount_eur: Number(adjustment.amount_eur) });
    adjustmentsByTutor.set(adjustment.tutor_id, rows);
  }
  return tutors.map(tutor => {
    const rows = sessionsByTutor.get(tutor.id) ?? [];
    const tutorAdjustments = adjustmentsByTutor.get(tutor.id) ?? [];
    const rate = tutor.company_commission_percent;
    const payRateEur = typeof rate === 'number' && Number.isFinite(rate) && rate >= 0 ? rate : null;
    return {
      id: tutor.id,
      fullName: tutor.full_name,
      email: tutor.email,
      payRateEur,
      completedCount: countProKlaseConfirmedCompleted(rows),
      breakdown: payRateEur === null ? null : sumProKlasePayBreakdown(
        rows, payRateEur, tutorAdjustments.reduce((sum, adjustment) => sum + adjustment.amount_eur, 0),
      ),
      adjustments: tutorAdjustments,
    };
  });
}
