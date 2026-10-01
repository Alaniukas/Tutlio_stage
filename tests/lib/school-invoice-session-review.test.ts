import { describe, expect, it } from 'vitest';
import { latestSchoolBillingDecisions, resolveSchoolInvoiceUnitPrice, reviewSchoolInvoiceSession, schoolInvoiceContractReason, type SchoolInvoiceContractWindow } from '../../src/lib/schoolInvoiceSessionReview';

const session = { id: 's1', class_group_id: 'group1', subject_id: 'math',
  start_time: '2026-09-14T13:00:00Z', end_time: '2026-09-14T14:00:00Z',
  status: 'no_show', status_confirmed_at: '2026-09-14T14:01:00Z', price: 12 };
const contract: SchoolInvoiceContractWindow = { id: 'c1', signing_status: 'signed', class_group_id: 'group1',
  accepted_at: '2026-09-01T10:00:00Z', start_within_14_status: 'yes',
  order_snapshot: { service_type: 'group', group_id: 'group1', start_date: '2026-09-01', end_date: '2027-06-01', schedule_slots: [] } as any };

describe('school invoice session review', () => {
  it('uses group names even when a historical subject names another child, and keeps individual names', () => {
    const subject = { name: 'Anglų kalba individuali Nojus Gibieža' };
    expect(reviewSchoolInvoiceSession({ ...session, subject, class_group: { name: 'Intermediate 1 grupė' } },
      [contract], undefined, false).subjectName).toBe('Intermediate 1 grupė');
    const namedContract = { ...contract, order_snapshot: { ...contract.order_snapshot, service_name: 'Intermediate 1 grupė' } as any };
    expect(reviewSchoolInvoiceSession({ ...session, subject }, [namedContract], undefined, false).subjectName)
      .toBe('Intermediate 1 grupė');
    expect(reviewSchoolInvoiceSession({ ...session, subject }, [], undefined, false).subjectName).toBe('Užsiėmimas');
    expect(reviewSchoolInvoiceSession({ ...session, class_group_id: null, subject }, [], undefined, false).subjectName)
      .toBe(subject.name);
  });

  it('keeps a confirmed group absence billable, but an audited exclusion waives its charge without rewriting attendance', () => {
    const normal = reviewSchoolInvoiceSession(session, [contract], undefined, false);
    expect(normal).toMatchObject({ included: true, status: 'no_show', reason: 'payable' });
    const excluded = reviewSchoolInvoiceSession(session, [contract], {
      id: 1, session_reference_id: 's1', excluded: true, reason: 'Family ended the agreement earlier', created_at: '2026-09-28T10:00:00Z',
    }, false);
    expect(excluded).toMatchObject({ included: false, status: 'no_show', reason: 'excluded' });
    expect(session.status).toBe('no_show');
  });

  it('honors the 14-day start choice and exact termination timestamp', () => {
    expect(schoolInvoiceContractReason(session, [{ ...contract, start_within_14_status: 'no' }])).toBe('outside_contract');
    expect(schoolInvoiceContractReason(session, [{ ...contract, withdrawal_requested_at: session.start_time }])).toBe('outside_contract');
    expect(schoolInvoiceContractReason(session, [{ ...contract, terminated_at: '2026-09-13T10:00:00Z' }])).toBe('outside_contract');
    expect(schoolInvoiceContractReason(session, [{ ...contract, withdrawal_requested_at: '2026-09-14T13:30:00Z' }])).toBe('contract_review');
  });

  it('bills lessons that already happened once the family later signs with immediate start', () => {
    const laterSign = { ...contract, accepted_at: '2026-09-24T07:29:00Z', start_within_14_status: 'yes' as const,
      unit_price_eur: 6, order_snapshot: { ...contract.order_snapshot, start_date: '2026-09-07', unit_price_eur: 6 } as any };
    expect(schoolInvoiceContractReason(session, [laterSign])).toBe('payable');
    expect(reviewSchoolInvoiceSession({ ...session, price: 0 }, [laterSign], undefined, false))
      .toMatchObject({ included: true, reason: 'payable', unitPriceEur: 6 });
    expect(schoolInvoiceContractReason(session, [{ ...laterSign, start_within_14_status: 'no' }])).toBe('outside_contract');
  });

  it('includes student-joined completed lessons from the agreed start, while excluding earlier history', () => {
    const laterSign = { ...contract, accepted_at: '2026-09-24T07:29:00Z', unit_price_eur: 6,
      order_snapshot: { ...contract.order_snapshot, start_date: '2026-09-07' } as any };
    const attended = { ...session, status: 'completed', status_confirmed_at: null, tutor_joined_at: null,
      student_joined_at: '2026-09-14T13:05:00Z', price: 0 };
    expect(reviewSchoolInvoiceSession(attended, [laterSign], undefined, false))
      .toMatchObject({ included: true, reason: 'payable', unitPriceEur: 6, statusConfirmedAt: null });
    expect(reviewSchoolInvoiceSession({ ...attended, start_time: '2026-09-03T13:00:00Z',
      end_time: '2026-09-03T14:00:00Z', student_joined_at: '2026-09-03T13:05:00Z' }, [laterSign], undefined, false))
      .toMatchObject({ included: false, reason: 'outside_contract' });
  });

  it('excludes the suspension interval and includes sessions after resumption', () => {
    const paused = { ...contract, suspension_started_at: '2026-09-12T00:00:00Z' };
    expect(schoolInvoiceContractReason(session, [paused])).toBe('suspended');
    expect(schoolInvoiceContractReason(session, [{ ...paused, suspension_resumed_at: '2026-09-14T12:00:00Z' }])).toBe('payable');
    expect(schoolInvoiceContractReason(session, [{ ...paused, suspension_until: '2026-09-13' }])).toBe('payable');
  });

  it('leaves overlapping agreements for review and does not apply a different subject agreement', () => {
    expect(schoolInvoiceContractReason(session, [contract, { ...contract, id: 'c2' }])).toBe('contract_review');
    expect(schoolInvoiceContractReason(session, [{ ...contract, class_group_id: 'another', order_snapshot: { ...contract.order_snapshot, group_id: 'another' } as any }])).toBe('payable');
    expect(schoolInvoiceContractReason(session, [{ ...contract, order_snapshot: null }])).toBe('contract_review');
  });

  it('holds unconfirmed outcomes and protects sessions already present in an issued invoice', () => {
    expect(reviewSchoolInvoiceSession({ ...session, status_confirmed_at: null }, [contract], undefined, false))
      .toMatchObject({ included: false, reason: 'unconfirmed', canConfirm: true });
    expect(reviewSchoolInvoiceSession(session, [contract], undefined, true))
      .toMatchObject({ included: false, reason: 'already_invoiced', canConfirm: false });
  });

  it('holds unmatched individual lessons when a signed agreement references a missing subject', () => {
    const individual = { ...session, class_group_id: null, subject_id: 'replacement-subject' };
    const stale = { ...contract, class_group_id: null, missingIndividualSubject: true,
      order_snapshot: { ...contract.order_snapshot, service_type: 'individual', subject_id: 'deleted-subject' } as any };
    expect(reviewSchoolInvoiceSession(individual, [stale], undefined, false))
      .toMatchObject({ included: false, reason: 'contract_review' });
    const valid = { ...stale, id: 'valid', missingIndividualSubject: false,
      order_snapshot: { ...stale.order_snapshot, subject_id: 'replacement-subject' } as any };
    expect(reviewSchoolInvoiceSession(individual, [stale, valid], undefined, false))
      .toMatchObject({ included: true, reason: 'payable' });
    expect(schoolInvoiceContractReason(session, [stale])).toBe('payable');
  });

  it('restores billing through a new audit entry while preserving the earlier exclusion', () => {
    const rows = [
      { id: 2, session_reference_id: 's1', excluded: false, reason: 'Correction verified', created_at: '2026-09-28T11:00:00Z' },
      { id: 1, session_reference_id: 's1', excluded: true, reason: 'Earlier end date', created_at: '2026-09-28T10:00:00Z' },
    ];
    const latest = latestSchoolBillingDecisions(rows);
    expect(reviewSchoolInvoiceSession(session, [contract], latest.get('s1'), false)).toMatchObject({ included: true, decisionId: 2 });
    expect(rows[1].excluded).toBe(true);
  });

  it('uses the signed extra-lessons unit price when the session row is stored as 0', () => {
    const priced = { ...contract, unit_price_eur: 6, order_snapshot: { ...contract.order_snapshot, unit_price_eur: 6 } as any };
    expect(resolveSchoolInvoiceUnitPrice({ price: 0, class_group_id: 'group1' }, [priced])).toBe(6);
    expect(reviewSchoolInvoiceSession({ ...session, price: 0 }, [priced], undefined, false).unitPriceEur).toBe(6);
  });
});
