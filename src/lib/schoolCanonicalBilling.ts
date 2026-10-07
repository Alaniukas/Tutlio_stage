import { usesBundledExtraLessonsDocx } from './extraLessonsContract.js';
import { schoolGroupSessionFollowsSchedule } from './schoolSessionSchedule.js';
import { isSessionInExtraLessonsServiceWindow, sessionYmdVilnius, type ExtraLessonsBillableSession, type ExtraLessonsBillingInput, type ExtraLessonsBillingResult } from './schoolExtraLessonsBilling.js';
import type { SchoolOrgCalendarSettings } from './schoolOrgCalendar.js';
import { schoolInvoiceDueDateWithCalendar } from './schoolOrgCalendar.js';

/** The frozen agreement, not today's template or organization flag, controls pricing. */
export function schoolContractBillingModel(contract: { organization_id?: string; filled_body?: string | null; order_snapshot?: { service_type?: string; individual_cancel_terms?: string } | null }): 'actual' | 'fixed' | 'review' {
  if (!usesBundledExtraLessonsDocx(contract.organization_id)) return 'fixed';
  const text = String(contract.filled_body || '').replace(/\s+/g, ' ');
  const cancellationTermsKnown = text.includes('Individualiems užsiėmimams taikomas 24 valandų atšaukimo terminas')
    || (contract.order_snapshot?.service_type === 'group'
      && contract.order_snapshot.individual_cancel_terms === 'netaikoma'
      && text.includes('Individualiems užsiėmimams taikomas toks atšaukimo terminas ir pasekmės: netaikoma.')
      && text.includes('užsiėmimas pagal tvarkaraštį faktiškai įvyko ir vaikui buvo rezervuota vieta'));
  return text.includes('faktiškai pagal tvarkaraštį įvykusių ir pagal 4 skyriaus sąlygas apmokamų užsiėmimų skaičius')
    && cancellationTermsKnown ? 'actual' : 'review';
}

export type CanonicalBillableSession = ExtraLessonsBillableSession & {
  end_time?: string | null;
  tutor_joined_at?: string | null;
  status_confirmed_at?: string | null;
  status_confirmed_by?: string | null;
  cancelled_by?: string | null;
  cancelled_at?: string | null;
  cancellation_reason_code?: string | null;
  is_complimentary?: boolean | null;
  paid?: boolean | null;
  payment_status?: string | null;
  lesson_package_id?: string | null;
  credit_applied_amount?: number | null;
  /** Evidence from another student's row of the same group occurrence. */
  group_occurred?: boolean;
};

export function groupOccurrenceKey(session: Pick<CanonicalBillableSession, 'class_group_id' | 'start_time'>): string {
  return `${session.class_group_id || ''}:${new Date(session.start_time).toISOString()}`;
}

/** Join tracking or an explicit outcome confirmation; actorless legacy group stamps are insufficient. */
export function hasSchoolOccurrenceEvidence(session: CanonicalBillableSession): boolean {
  if (!['completed', 'no_show'].includes(session.status)) return false;
  if (session.tutor_joined_at) return true;
  if (session.status === 'completed' && session.student_joined_at) return true;
  if (session.status === 'no_show' && session.status_confirmed_at) return true;
  if (session.status === 'completed' && session.status_confirmed_at) {
    if (!session.class_group_id) return true;
    const confirmedAt = Date.parse(session.status_confirmed_at);
    const endedAt = Date.parse(session.end_time || '');
    // In-person groups have no join tracking. A teacher/admin attestation after
    // the lesson ended proves delivery; the historical end-time backfill does not.
    return Boolean(session.status_confirmed_by) && Number.isFinite(confirmedAt)
      && Number.isFinite(endedAt) && confirmedAt >= endedAt;
  }
  return false;
}

/** Canonical DOCX §§4.3–4.5: distinguish absent child from a service not supplied. */
export function canonicalSessionCharge(session: CanonicalBillableSession, serviceType: 'group' | 'individual'): 'payable' | 'free' | 'review' {
  if (session.is_complimentary || session.cancellation_reason_code === 'tutor_no_show') return 'free';
  if (session.paid || session.payment_status === 'paid' || session.lesson_package_id || Number(session.credit_applied_amount) > 0) return 'review';
  if (session.status === 'cancelled') {
    if (session.cancelled_by === 'tutor') return 'free';
    if (session.cancelled_by !== 'student') return 'review';
    if (serviceType === 'group') return session.group_occurred ? 'payable' : 'review';
    const cancelledAt = Date.parse(session.cancelled_at || '');
    const startAt = Date.parse(session.start_time);
    if (!Number.isFinite(cancelledAt) || !Number.isFinite(startAt)) return 'review';
    return startAt - cancelledAt < 24 * 60 * 60 * 1000 ? 'payable' : 'free';
  }
  if (hasSchoolOccurrenceEvidence(session) || (serviceType === 'group' && session.group_occurred)) return 'payable';
  return 'review';
}

export function computeCanonicalSchoolMonthlyBill(input: Omit<ExtraLessonsBillingInput, 'sessions'> & {
  sessions: CanonicalBillableSession[];
  service_type: 'group' | 'individual';
  acceptedAtIso?: string | null;
}): ExtraLessonsBillingResult & { billed_session_ids: string[]; review_session_ids: string[] } {
  const billed: CanonicalBillableSession[] = [];
  const review: string[] = [];
  const seen = new Set<string>();
  const payableOccurrences = new Map<number, string>();
  for (const session of input.sessions) {
    if (seen.has(session.id)) continue;
    seen.add(session.id);
    if (input.service_type === 'group' && !schoolGroupSessionFollowsSchedule(session, input.groupScheduleSlots)) continue;
    const day = sessionYmdVilnius(session.start_time);
    if (!day || day < input.period_start || day > input.period_end
      || (input.serviceEndYmd && day > input.serviceEndYmd)
      || !isSessionInExtraLessonsServiceWindow(session.start_time, { serviceStartYmd: input.serviceStartYmd || '', endedAtIso: input.endedAtIso })) continue;
    // Mid-lesson termination needs an explicit partial-service settlement.
    if (input.endedAtIso && session.end_time && Date.parse(session.end_time) > Date.parse(input.endedAtIso)) {
      review.push(session.id); continue;
    }
    const charge = canonicalSessionCharge(session, input.service_type);
    if (charge === 'review') review.push(session.id);
    if (charge === 'payable') {
      const occurrence = Date.parse(session.start_time);
      const duplicate = payableOccurrences.get(occurrence);
      if (duplicate) {
        if (!review.includes(duplicate)) review.push(duplicate);
        review.push(session.id);
      } else payableOccurrences.set(occurrence, session.id);
      billed.push(session);
    }
  }
  const unit = Math.round(input.unit_price_eur * 100) / 100;
  const extra = billed.filter((session) => session.school_billing_kind === 'extra');
  const base = billed.length - extra.length;
  const amount = (count: number) => Math.round(count * unit * 100) / 100;
  return { period_start: input.period_start, period_end: input.period_end, unit_price_eur: unit,
    base_lessons: base, base_amount_eur: amount(base), extra_lessons: extra.length,
    extra_amount_eur: amount(extra.length), total_eur: amount(billed.length),
    extra_session_ids: extra.map((session) => session.id), billed_session_ids: billed.map((session) => session.id), review_session_ids: review };
}

/** Canonical §5.2; LT public holidays + org closures, excluding issue day. */
export function schoolInvoiceDueDate(
  issuedAt: Date,
  workingDays = 5,
  calendar?: SchoolOrgCalendarSettings | null,
): string {
  return schoolInvoiceDueDateWithCalendar(issuedAt, workingDays, calendar);
}
