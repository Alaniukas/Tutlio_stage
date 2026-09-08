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
  class_group_id?: string | null;
  subject_id?: string | null;
};

export type ExtraLessonsBillingInput = {
  unit_price_eur: number;
  base_lessons_per_month: number;
  period_start: string;
  period_end: string;
  sessions: ExtraLessonsBillableSession[];
  serviceStartYmd?: string | null;
  endedAtIso?: string | null;
  serviceEndYmd?: string | null;
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
  const day = sessionYmdVilnius(iso);
  return day >= start && day <= end;
}

function isPayableExtra(session: ExtraLessonsBillableSession): boolean {
  if (session.cancelled || session.status === 'cancelled') return false;
  if (session.school_billing_kind !== 'extra') return false;
  if (session.status === 'no_show') return false;
  return Boolean(session.student_joined_at) || session.status === 'completed';
}

export function sessionYmdUtc(iso: string): string {
  return String(iso || '').slice(0, 10);
}

export function sessionYmdVilnius(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
}

/** Scope each student's lessons to this agreement, never to all their subjects/groups. */
export function sessionMatchesExtraLessonsContract(
  session: ExtraLessonsBillableSession,
  scope: { service_type: string; group_id?: string | null; subject_id?: string | null },
): boolean {
  if (scope.service_type === 'group') return Boolean(scope.group_id) && session.class_group_id === scope.group_id;
  if (scope.service_type === 'individual') {
    return !session.class_group_id && Boolean(scope.subject_id) && session.subject_id === scope.subject_id;
  }
  return false;
}

/** Skip lessons before allowed start and after withdrawal/termination. */
export function isSessionInExtraLessonsServiceWindow(
  sessionStartIso: string,
  opts: { serviceStartYmd: string; endedAtIso?: string | null },
): boolean {
  const day = sessionYmdVilnius(sessionStartIso);
  if (!day) return false;
  if (opts.serviceStartYmd && day < opts.serviceStartYmd) return false;
  if (opts.endedAtIso) {
    const endDay = sessionYmdVilnius(opts.endedAtIso);
    if (endDay && day > endDay) return false;
    if (Date.parse(sessionStartIso) >= Date.parse(opts.endedAtIso)) return false;
  }
  return true;
}

export function computeExtraLessonsMonthlyBill(input: ExtraLessonsBillingInput): ExtraLessonsBillingResult {
  const unit = Math.round(Number(input.unit_price_eur) * 100) / 100;
  const baseLessons = Math.max(0, Math.round(Number(input.base_lessons_per_month) || 0));
  const extraIds = input.sessions
    .filter((s) => inPeriod(s.start_time, input.period_start, input.period_end)
      && (!input.serviceEndYmd || sessionYmdVilnius(s.start_time) <= input.serviceEndYmd)
      && isSessionInExtraLessonsServiceWindow(s.start_time, {
        serviceStartYmd: input.serviceStartYmd || '',
        endedAtIso: input.endedAtIso,
      })
      && isPayableExtra(s))
    .map((s) => s.id);
  const extraLessons = extraIds.length;
  const periodOverlapsService = (!input.serviceStartYmd || input.period_end >= input.serviceStartYmd)
    && (!input.serviceEndYmd || input.period_start <= input.serviceEndYmd)
    && (!input.endedAtIso || input.period_start <= sessionYmdVilnius(input.endedAtIso));
  const billableBase = periodOverlapsService ? baseLessons : 0;
  const extraAmount = Math.round(extraLessons * unit * 100) / 100;
  const baseAmount = Math.round(billableBase * unit * 100) / 100;
  return {
    period_start: input.period_start,
    period_end: input.period_end,
    unit_price_eur: unit,
    base_lessons: billableBase,
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
