import { describe, expect, it } from 'vitest';
import { canonicalSessionCharge, computeCanonicalSchoolMonthlyBill, schoolContractBillingModel, schoolInvoiceDueDate } from '../../src/lib/schoolCanonicalBilling';
import { EXTRA_LESSONS_LEGAL_BODY } from '../../src/lib/extraLessonsLegalBody';

const base = { unit_price_eur: 10, base_lessons_per_month: 8, period_start: '2026-08-01', period_end: '2026-08-31', service_type: 'group' as const };
const session = { id: 'one', start_time: '2026-08-10T10:00:00Z', end_time: '2026-08-10T11:00:00Z', status: 'completed', tutor_joined_at: '2026-08-10T10:00:00Z', school_billing_kind: 'base' as const };

describe('canonical DOCX monthly charges', () => {
  it('recognizes frozen canonical terms and never silently switches an unknown or custom agreement', () => {
    const organization_id = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';
    expect(schoolContractBillingModel({ organization_id, filled_body: EXTRA_LESSONS_LEGAL_BODY })).toBe('actual');
    expect(schoolContractBillingModel({ organization_id, filled_body: 'old agreement' })).toBe('review');
    expect(schoolContractBillingModel({ organization_id: 'custom-org', filled_body: EXTRA_LESSONS_LEGAL_BODY })).toBe('fixed');
  });
  it('recognizes the frozen group-only edition with individual cancellation explicitly not applicable', () => {
    const organization_id = '2dd745fc-20e7-4bc1-a5cd-a89cfe22ec17';
    const filled_body = EXTRA_LESSONS_LEGAL_BODY.replace('Individualiems užsiėmimams taikomas 24 valandų atšaukimo terminas:', 'Individualiems užsiėmimams taikomas toks atšaukimo terminas ir pasekmės: netaikoma.');
    expect(schoolContractBillingModel({ organization_id, filled_body, order_snapshot: { service_type: 'group', individual_cancel_terms: 'netaikoma' } })).toBe('actual');
    expect(schoolContractBillingModel({ organization_id, filled_body, order_snapshot: { service_type: 'individual', individual_cancel_terms: 'netaikoma' } })).toBe('review');
  });
  it('charges actual delivered rows, including child absence, without a fixed 8-lesson floor', () => {
    const bill = computeCanonicalSchoolMonthlyBill({ ...base, sessions: [session, { ...session, id: 'absent', start_time: '2026-08-11T10:00:00Z', end_time: '2026-08-11T11:00:00Z', status: 'no_show', student_joined_at: null }, { ...session, id: 'teacher-cancelled', status: 'cancelled', cancelled_by: 'tutor' }] });
    expect(bill.total_eur).toBe(20);
    expect(bill.base_lessons).toBe(2);
    expect(bill.billed_session_ids).toEqual(['one', 'absent']);
    expect(bill.review_session_ids).toEqual([]);
  });
  it('charges a cancelled group reservation only with evidence the group occurred', () => {
    const cancelled = { ...session, status: 'cancelled', cancelled_by: 'student' };
    expect(canonicalSessionCharge(cancelled, 'group')).toBe('review');
    expect(canonicalSessionCharge({ ...cancelled, group_occurred: true }, 'group')).toBe('payable');
  });
  it('applies exactly the canonical 24h individual deadline and keeps provider cancellations free', () => {
    const cancelled = { ...session, status: 'cancelled', cancelled_by: 'student' };
    expect(canonicalSessionCharge({ ...cancelled, cancelled_at: '2026-08-09T10:00:00Z' }, 'individual')).toBe('free');
    expect(canonicalSessionCharge({ ...cancelled, cancelled_at: '2026-08-09T10:00:01Z' }, 'individual')).toBe('payable');
    expect(canonicalSessionCharge({ ...cancelled, cancelled_by: 'tutor' }, 'individual')).toBe('free');
    expect(canonicalSessionCharge(cancelled, 'individual')).toBe('review');
    expect(canonicalSessionCharge({ ...cancelled, cancellation_reason_code: 'tutor_no_show' }, 'individual')).toBe('free');
  });
  it('holds auto-completed or unresolved outcomes instead of pretending time alone proves delivery', () => {
    const bill = computeCanonicalSchoolMonthlyBill({ ...base, sessions: [
      { ...session, id: 'auto', tutor_joined_at: null }, { ...session, id: 'active', status: 'active' },
      { ...session, id: 'confirmed', tutor_joined_at: null, status_confirmed_at: '2026-08-10T11:05:00Z' },
    ] });
    expect(bill.billed_session_ids).toEqual(['confirmed']);
    expect(bill.review_session_ids).toEqual(['auto', 'active']);
  });
  it('bills only before termination and holds a lesson crossing the termination time', () => {
    const bill = computeCanonicalSchoolMonthlyBill({ ...base, endedAtIso: '2026-08-10T10:30:00Z', sessions: [
      { ...session, id: 'earlier', start_time: '2026-08-09T10:00:00Z', end_time: '2026-08-09T11:00:00Z' }, session,
      { ...session, id: 'later', start_time: '2026-08-11T10:00:00Z' },
    ] });
    expect(bill.billed_session_ids).toEqual(['earlier']);
    expect(bill.review_session_ids).toEqual(['one']);
  });
  it('excludes services before the 14-day gate and respects each student actual schedule rows', () => {
    expect(computeCanonicalSchoolMonthlyBill({ ...base, serviceStartYmd: '2026-08-15', sessions: [session] }).total_eur).toBe(0);
    expect(computeCanonicalSchoolMonthlyBill({ ...base, sessions: [session] }).total_eur).toBe(10);
    expect(computeCanonicalSchoolMonthlyBill({ ...base, sessions: [session, { ...session, id: 'two', start_time: '2026-08-11T10:00:00Z', end_time: '2026-08-11T11:00:00Z' }] }).total_eur).toBe(20);
    expect(computeCanonicalSchoolMonthlyBill({ ...base, acceptedAtIso: '2026-08-10T10:30:00Z', sessions: [session] }).total_eur).toBe(0);
  });
  it('holds paid or packaged lessons to prevent charging the same service again', () => {
    expect(canonicalSessionCharge({ ...session, paid: true }, 'individual')).toBe('review');
    expect(canonicalSessionCharge({ ...session, lesson_package_id: 'paid-package' }, 'individual')).toBe('review');
    expect(canonicalSessionCharge({ ...session, credit_applied_amount: 5 }, 'individual')).toBe('review');
  });
  it('holds duplicate payable rows for the same pupil service occurrence', () => {
    const bill = computeCanonicalSchoolMonthlyBill({ ...base, sessions: [session, { ...session, id: 'duplicate' }] });
    expect(bill.review_session_ids).toEqual(['one', 'duplicate']);
  });
});

describe('canonical five working day invoice deadline', () => {
  it('counts from issuance, excluding weekends and Lithuanian holidays', () => {
    expect(schoolInvoiceDueDate(new Date('2026-09-01T04:00:00Z'))).toBe('2026-09-08');
    expect(schoolInvoiceDueDate(new Date('2026-12-23T12:00:00Z'))).toBe('2027-01-04');
    expect(schoolInvoiceDueDate(new Date('2026-04-03T12:00:00Z'))).toBe('2026-04-13');
  });
});
