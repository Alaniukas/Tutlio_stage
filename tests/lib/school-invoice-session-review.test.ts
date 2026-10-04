import { describe, expect, it } from 'vitest';
import { buildSchoolLessonInvoiceLines } from '../../src/lib/schoolMonthlyInvoiceLines';
import { latestSchoolBillingDecisions, resolveSchoolInvoiceUnitPrice, reviewSchoolInvoiceSession, schoolInvoiceBillableSubjectKey, schoolInvoiceContractReason, schoolInvoiceSessionActivityName, type SchoolInvoiceContractWindow } from '../../src/lib/schoolInvoiceSessionReview';

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
    expect(reviewSchoolInvoiceSession({ ...session, subject, class_group: { name: 'Intermediate 1 grupė' } },
      [], undefined, false).subjectName).toBe('Intermediate 1 grupė');
    expect(reviewSchoolInvoiceSession({ ...session, class_group_id: null, subject }, [], undefined, false).subjectName)
      .toBe(subject.name);
  });

  it('prefers the signed individual contract label when the session subject names another child', () => {
    const wrongSubject = { name: 'Kristina Šlaustienė Skaitymas ir rašymas (individuali) Nojus Gibieža' };
    const domasContract = {
      ...contract, class_group_id: null,
      order_snapshot: {
        service_type: 'individual', subject_id: 'domas-subject', service_name: 'Kristina Šlaustienė Skaitymas ir rašymas (individuali) Domas Sakalauskas',
        start_date: '2026-09-01', end_date: '2027-06-01',
      } as any,
    };
    expect(schoolInvoiceSessionActivityName(
      { ...session, class_group_id: null, subject_id: 'domas-subject', subject: wrongSubject },
      [domasContract],
      'Sakalauskas Domas',
    )).toBe('Kristina Šlaustienė Skaitymas ir rašymas (individuali) Domas Sakalauskas');
    expect(schoolInvoiceSessionActivityName(
      { ...session, class_group_id: null, subject_id: 'nojus-subject', subject: wrongSubject },
      [],
      'Sakalauskas Domas',
    )).toBe('Kristina Šlaustienė Skaitymas ir rašymas (individuali) Sakalauskas Domas');
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

  it('picks the newest overlapping agreement and ignores archived duplicates', () => {
    const older = { ...contract, id: 'c-old', accepted_at: '2026-08-01T10:00:00Z' };
    const newer = { ...contract, id: 'c-new', accepted_at: '2026-09-15T10:00:00Z' };
    expect(schoolInvoiceContractReason(session, [older, newer])).toBe('payable');
    expect(schoolInvoiceContractReason(session, [contract, { ...contract, id: 'c2' }])).toBe('payable');
    expect(schoolInvoiceContractReason(session, [contract, { ...contract, id: 'c-archived', archived_at: '2026-09-27T10:00:00Z' }])).toBe('payable');
    expect(schoolInvoiceContractReason(session, [{ ...contract, class_group_id: 'another', order_snapshot: { ...contract.order_snapshot, group_id: 'another' } as any }])).toBe('payable');
    expect(schoolInvoiceContractReason(session, [{ ...contract, order_snapshot: null }])).toBe('contract_review');
  });

  it('holds unconfirmed outcomes and protects sessions already present in an issued invoice', () => {
    expect(reviewSchoolInvoiceSession({ ...session, status_confirmed_at: null }, [contract], undefined, false))
      .toMatchObject({ included: false, reason: 'unconfirmed', canConfirm: true });
    expect(reviewSchoolInvoiceSession(session, [contract], undefined, true))
      .toMatchObject({ included: false, reason: 'already_invoiced', canConfirm: false });
  });

  it('matches individual lessons by service name when the frozen subject id drifted', () => {
    const stale = { ...contract, class_group_id: null, missingIndividualSubject: true, unit_price_eur: 20,
      order_snapshot: { ...contract.order_snapshot, service_type: 'individual', subject_id: 'deleted-subject',
        service_name: 'Rusų kalba Tauras Granickis', start_date: '2026-09-01', end_date: '2027-06-01' } as any };
    const russian = { ...session, class_group_id: null, subject_id: 'current-russian', price: 0,
      subject: { name: 'Rusų kalba Tauras Granickis', price: 20 } };
    expect(reviewSchoolInvoiceSession(russian, [stale], undefined, false, undefined, 'Granickis Tauras'))
      .toMatchObject({ included: true, reason: 'payable', unitPriceEur: 20 });
    const unrelated = { ...session, class_group_id: null, subject_id: 'other-subject', price: 15,
      subject: { name: 'Kita individuali paslauga', price: 15 } };
    expect(reviewSchoolInvoiceSession(unrelated, [stale], undefined, false))
      .toMatchObject({ included: true, reason: 'payable', unitPriceEur: 15 });
    const valid = { ...stale, id: 'valid', missingIndividualSubject: false,
      order_snapshot: { ...stale.order_snapshot, subject_id: 'current-russian' } as any };
    expect(reviewSchoolInvoiceSession(russian, [stale, valid], undefined, false, undefined, 'Granickis Tauras'))
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

  it('marks unsigned group agreements in the activity label', () => {
    const sentOnly = { ...contract, signing_status: 'sent', accepted_at: null };
    expect(reviewSchoolInvoiceSession({ ...session, class_group: { name: 'Etika (5-9 kl)' } },
      [sentOnly], undefined, false).subjectName).toBe('Etika (5-9 kl) · sutartis nepasirašyta');
  });

  it('does not use a group subject price when the session row is stored as 0', () => {
    const priced = { ...contract, unit_price_eur: 6, order_snapshot: { ...contract.order_snapshot, unit_price_eur: 6 } as any };
    expect(resolveSchoolInvoiceUnitPrice({ price: 0, class_group_id: 'group1' }, [priced])).toBe(6);
    expect(reviewSchoolInvoiceSession({ ...session, price: 0 }, [priced], undefined, false).unitPriceEur).toBe(6);
    expect(resolveSchoolInvoiceUnitPrice({
      price: 0,
      class_group_id: 'group1',
      subject_id: 'wrong-individual',
      subject: { price: 20 },
    }, [])).toBe(0);
  });

  it('bills group lessons from a complete sent offer without a signature', () => {
    const sentOnly = { ...contract, signing_status: 'sent', accepted_at: null, unit_price_eur: 6,
      order_snapshot: { ...contract.order_snapshot, unit_price_eur: 6 } as any };
    expect(reviewSchoolInvoiceSession({ ...session, price: 0 }, [sentOnly], undefined, false))
      .toMatchObject({ included: true, reason: 'payable', unitPriceEur: 6 });
    const attended = { ...session, status: 'completed', tutor_joined_at: '2026-09-10T08:59:00Z',
      student_joined_at: '2026-09-10T09:14:00Z', status_confirmed_at: '2026-09-10T10:00:00Z', price: 0 };
    expect(reviewSchoolInvoiceSession(attended, [sentOnly], undefined, false))
      .toMatchObject({ included: true, reason: 'payable', unitPriceEur: 6 });
  });

  it('still requires join evidence when a sent offer has no billable price', () => {
    const sentOnly = { ...contract, signing_status: 'sent', accepted_at: null, unit_price_eur: null,
      order_snapshot: { ...contract.order_snapshot, unit_price_eur: null } as any };
    const attended = { ...session, status: 'completed', tutor_joined_at: '2026-09-10T08:59:00Z',
      student_joined_at: '2026-09-10T09:14:00Z', status_confirmed_at: '2026-09-10T10:00:00Z', price: 0 };
    expect(reviewSchoolInvoiceSession(attended, [sentOnly], undefined, false))
      .toMatchObject({ included: true, reason: 'payable' });
    expect(reviewSchoolInvoiceSession({ ...attended, tutor_joined_at: null, student_joined_at: null,
      status_confirmed_at: '2026-09-10T10:00:00Z' }, [sentOnly], undefined, false))
      .toMatchObject({ included: false, reason: 'outside_contract' });
  });

  it('bills a direct individual lesson without any extra-lessons agreement', () => {
    const individual = { ...session, class_group_id: null, subject_id: 'alina-lt', price: 20,
      tutor_joined_at: null, student_joined_at: '2026-09-07T08:02:00Z', status_confirmed_at: '2026-09-07T09:00:00Z',
      subject: { name: 'Alina Armonienė Lietuvių kalba individuali pamoka', price: 20 } };
    expect(reviewSchoolInvoiceSession(individual, [], undefined, false))
      .toMatchObject({ included: true, reason: 'payable', unitPriceEur: 20 });
  });

  it('assigns a billable subject key to an orphan group session matched by schedule', () => {
    const matematika = {
      ...contract,
      class_group_id: null,
      order_snapshot: {
        service_type: 'group',
        group_id: 'old-group',
        group_name: 'Ieva Šimkonytė Matematika 5 klasė',
        service_name: 'Ieva Šimkonytė Matematika 5 klasė',
        tutor_name: 'Ieva Šimkonytė',
        start_date: '2026-09-11',
        schedule_slots: [{ weekday: 5, start_time: '15:00', end_time: '16:00' }],
      } as any,
    };
    expect(schoolInvoiceBillableSubjectKey({
      id: 'orphan-math',
      class_group_id: null,
      subject_id: null,
      start_time: '2026-09-11T12:00:00Z',
      tutor: { full_name: 'Ieva Šimkonytė' },
    }, [matematika])).toBe('old-group');
  });

  it('bills an attended group lesson before the session row is linked to a class group', () => {
    const matematika = {
      ...contract,
      id: 'math-contract',
      class_group_id: null,
      unit_price_eur: 6,
      accepted_at: '2026-09-11T10:04:47Z',
      start_within_14_status: 'yes' as const,
      order_snapshot: {
        service_type: 'group',
        group_id: 'old-group',
        group_name: 'Ieva Šimkonytė Matematika 5 klasė',
        service_name: 'Ieva Šimkonytė Matematika 5 klasė',
        tutor_name: 'Ieva Šimkonytė',
        start_date: '2026-09-11',
        end_date: '2026-10-09',
        unit_price_eur: 6,
        schedule_slots: [{ weekday: 5, start_time: '15:00', end_time: '16:00' }],
      } as any,
    };
    const attended = {
      ...session,
      id: 'orphan-math',
      class_group_id: null,
      subject_id: null,
      class_group: null,
      subject: null,
      start_time: '2026-09-11T12:00:00Z',
      end_time: '2026-09-11T13:00:00Z',
      status: 'completed',
      tutor: { full_name: 'Ieva Šimkonytė' },
      tutor_joined_at: '2026-09-11T12:03:00Z',
      student_joined_at: '2026-09-11T11:58:00Z',
      status_confirmed_at: '2026-10-01T06:52:00Z',
      price: 0,
    };
    expect(reviewSchoolInvoiceSession(attended, [matematika], undefined, false))
      .toMatchObject({ included: true, reason: 'payable', unitPriceEur: 6 });
  });

  it('bills a group lesson when the class group row was recreated after signing', () => {
    const matematika = {
      ...contract,
      id: 'math-contract',
      class_group_id: null,
      unit_price_eur: 6,
      accepted_at: '2026-09-11T10:04:47Z',
      start_within_14_status: 'yes' as const,
      order_snapshot: {
        service_type: 'group',
        group_id: 'old-group',
        group_name: 'Ieva Šimkonytė Matematika 5 klasė',
        service_name: 'Ieva Šimkonytė Matematika 5 klasė',
        tutor_name: 'Ieva Šimkonytė',
        start_date: '2026-09-11',
        end_date: '2026-10-09',
        unit_price_eur: 6,
        schedule_slots: [{ weekday: 5, start_time: '15:30', end_time: '16:30' }],
      } as any,
    };
    const attended = {
      ...session,
      id: 'relinked-math',
      class_group_id: 'new-group',
      class_group: { name: 'Ieva Šimkonytė Matematika 5 klasė' },
      subject_id: 'math-subject',
      subject: { name: 'Matematika', price: 0 },
      start_time: '2026-09-25T12:30:00Z',
      end_time: '2026-09-25T13:30:00Z',
      status: 'completed',
      tutor: { full_name: 'Ieva Šimkonytė' },
      tutor_joined_at: '2026-09-25T12:32:00Z',
      student_joined_at: '2026-09-25T12:24:00Z',
      status_confirmed_at: '2026-10-01T05:56:00Z',
      price: 0,
    };
    expect(reviewSchoolInvoiceSession(attended, [matematika], undefined, false))
      .toMatchObject({ included: true, reason: 'payable', unitPriceEur: 6 });
  });

  it('groups pre-link individual sessions with later rows under the same contract subject', () => {
    const russian = {
      ...contract,
      id: 'russian-sent',
      class_group_id: null,
      signing_status: 'sent',
      accepted_at: null,
      unit_price_eur: 20,
      order_snapshot: {
        service_type: 'individual',
        subject_id: 'russian-subject',
        service_name: 'Olga Pekorienė Rusų kalba Individuali Lukrecija Daukaitė',
        tutor_name: 'Olga Pekorienė',
        start_date: '2026-09-10',
        unit_price_eur: 20,
      } as any,
    };
    const orphan = {
      ...session,
      id: 'russian-orphan',
      class_group_id: null,
      subject_id: null,
      subject: null,
      start_time: '2026-09-10T06:00:00Z',
      end_time: '2026-09-10T07:00:00Z',
      status: 'completed',
      tutor: { full_name: 'Olga Pekorienė' },
      tutor_joined_at: '2026-09-10T05:57:00Z',
      student_joined_at: '2026-09-10T05:59:00Z',
      status_confirmed_at: '2026-09-10T07:00:00Z',
      price: 20,
    };
    const linked = {
      ...orphan,
      id: 'russian-linked',
      subject_id: 'russian-subject',
      subject: { name: 'Olga Pekorienė Rusų kalba Individuali Lukrecija Daukaitė', price: 20 },
      start_time: '2026-09-17T06:00:00Z',
      end_time: '2026-09-17T07:00:00Z',
    };
    expect(schoolInvoiceBillableSubjectKey(orphan, [russian], 'Daukaitė Lukrecija')).toBe('russian-subject');
    expect(reviewSchoolInvoiceSession(orphan, [russian], undefined, false, undefined, 'Daukaitė Lukrecija').subjectName)
      .toBe('Olga Pekorienė Rusų kalba Individuali Lukrecija Daukaitė · sutartis nepasirašyta');
    expect(schoolInvoiceBillableSubjectKey(linked, [russian], 'Daukaitė Lukrecija')).toBe('russian-subject');
  });

  it('end-to-end: pre-link and linked individual sessions merge into one invoice line', () => {
    const russian = {
      ...contract,
      id: 'russian-sent',
      class_group_id: null,
      signing_status: 'sent',
      accepted_at: null,
      unit_price_eur: 20,
      order_snapshot: {
        service_type: 'individual',
        subject_id: 'russian-subject',
        service_name: 'Olga Pekorienė Rusų kalba Individuali Lukrecija Daukaitė',
        tutor_name: 'Olga Pekorienė',
        start_date: '2026-09-10',
        unit_price_eur: 20,
      } as any,
    };
    const rows = [
      {
        id: 'russian-orphan',
        class_group_id: null,
        subject_id: null,
        subject: null,
        start_time: '2026-09-10T06:00:00Z',
        end_time: '2026-09-10T07:00:00Z',
        status: 'completed',
        tutor_id: 'olga',
        tutor: { full_name: 'Olga Pekorienė' },
        tutor_joined_at: '2026-09-10T05:57:00Z',
        student_joined_at: '2026-09-10T05:59:00Z',
        status_confirmed_at: '2026-09-10T07:00:00Z',
        price: 20,
      },
      {
        id: 'russian-2',
        class_group_id: null,
        subject_id: 'russian-subject',
        subject: { name: 'Olga Pekorienė Rusų kalba Individuali Lukrecija Daukaitė', price: 20 },
        start_time: '2026-09-17T06:00:00Z',
        end_time: '2026-09-17T07:00:00Z',
        status: 'completed',
        tutor_id: 'olga',
        tutor: { full_name: 'Olga Pekorienė' },
        tutor_joined_at: '2026-09-17T06:00:00Z',
        student_joined_at: '2026-09-17T06:00:00Z',
        status_confirmed_at: '2026-09-18T08:20:00Z',
        price: 20,
      },
      {
        id: 'russian-3',
        class_group_id: null,
        subject_id: 'russian-subject',
        subject: { name: 'Olga Pekorienė Rusų kalba Individuali Lukrecija Daukaitė', price: 20 },
        start_time: '2026-09-24T06:00:00Z',
        end_time: '2026-09-24T07:00:00Z',
        status: 'completed',
        tutor_id: 'olga',
        tutor: { full_name: 'Olga Pekorienė' },
        tutor_joined_at: '2026-09-24T05:59:00Z',
        student_joined_at: '2026-09-24T06:00:00Z',
        status_confirmed_at: '2026-09-24T07:00:00Z',
        price: 20,
      },
    ];
    const billable = rows.flatMap((row) => {
      const review = reviewSchoolInvoiceSession(row, [russian], undefined, false, Date.parse('2026-10-01T00:00:00Z'), 'Daukaitė Lukrecija');
      if (!review.included) return [];
      const subjectId = schoolInvoiceBillableSubjectKey(row, [russian], 'Daukaitė Lukrecija');
      if (!subjectId) return [];
      return [{
        id: row.id,
        studentId: 'lukrecija',
        studentName: 'Daukaitė Lukrecija',
        classGroupId: null,
        subjectId,
        subjectName: review.subjectName,
        tutorId: row.tutor_id,
        tutorName: 'Olga Pekorienė',
        unitPriceEur: review.unitPriceEur,
      }];
    });
    expect(billable).toHaveLength(3);
    const lines = buildSchoolLessonInvoiceLines(billable);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      quantity: 3,
      unitPriceEur: 20,
      originalAmountEur: 60,
      amountEur: 60,
      sessionIds: ['russian-orphan', 'russian-2', 'russian-3'],
    });
    expect(lines[0].subjectName).toContain('Rusų kalba Individuali Lukrecija Daukaitė');
  });

  it('does not bill a trial lesson even when attendance is confirmed', () => {
    const attended = {
      ...session,
      class_group_id: null,
      subject_id: 'trial-subject',
      subject: { name: 'Bandomoji pamoka', price: 6, is_trial: true },
      status: 'completed',
      student_joined_at: '2026-09-10T08:59:00Z',
      status_confirmed_at: '2026-09-10T10:00:00Z',
      price: 0,
    };
    expect(reviewSchoolInvoiceSession(attended, [contract], undefined, false))
      .toMatchObject({ included: false, reason: 'free', unitPriceEur: 0 });
  });
});
