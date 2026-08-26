/**
 * Monthly extra-lessons invoice: base credits from the signed contract
 * plus extra joined lessons beyond the allotment.
 */
export type ExtraLessonsBillableSession = {
  id: string;
  start_time: string;
  status: string;
  student_joined_at?: string | null;
  school_billing_kind?: 'base' | 'extra' | null;
  cancelled?: boolean;
};

export type ExtraLessonsBillingInput = {
  unit_price_eur: number;
  base_lessons_per_month: number;
  period_start: string;
  period_end: string;
  sessions: ExtraLessonsBillableSession[];
};

export type ExtraLessonsBillingResult = {
  period_start: string;
  period_end: string;
  unit_price_eur: number;
  base_lessons: number;
  base_amount_eur: number;
  extra_lessons: number;
  extra_amount_eur: number;
  total_eur: number;
  extra_session_ids: string[];
};

function inPeriod(iso: string, start: string, end: string): boolean {
  const day = iso.slice(0, 10);
  return day >= start && day <= end;
}

function isPayableExtra(session: ExtraLessonsBillableSession): boolean {
  if (session.status === 'cancelled') return false;
  if (session.school_billing_kind !== 'extra') return false;
  if (session.status === 'no_show') return false;
  return Boolean(session.student_joined_at) || session.status === 'completed';
}

export function computeExtraLessonsMonthlyBill(input: ExtraLessonsBillingInput): ExtraLessonsBillingResult {
  const unit = Math.round(Number(input.unit_price_eur) * 100) / 100;
  const baseLessons = Math.max(0, Math.round(Number(input.base_lessons_per_month) || 0));
  const extraIds = input.sessions
    .filter((s) => inPeriod(s.start_time, input.period_start, input.period_end) && isPayableExtra(s))
    .map((s) => s.id);
  const extraLessons = extraIds.length;
  const baseAmount = Math.round(baseLessons * unit * 100) / 100;
  const extraAmount = Math.round(extraLessons * unit * 100) / 100;
  return {
    period_start: input.period_start,
    period_end: input.period_end,
    unit_price_eur: unit,
    base_lessons: baseLessons,
    base_amount_eur: baseAmount,
    extra_lessons: extraLessons,
    extra_amount_eur: extraAmount,
    total_eur: Math.round((baseAmount + extraAmount) * 100) / 100,
    extra_session_ids: extraIds,
  };
}

export function previousCalendarMonthVilnius(now = new Date()): { start: string; end: string } {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vilnius',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [y, m] = ymd.split('-').map(Number);
  const prevMonth = m === 1 ? 12 : m - 1;
  const prevYear = m === 1 ? y - 1 : y;
  const lastDay = new Date(prevYear, prevMonth, 0).getDate();
  return {
    start: `${prevYear}-${String(prevMonth).padStart(2, '0')}-01`,
    end: `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}
