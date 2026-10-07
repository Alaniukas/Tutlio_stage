import { describe, expect, it } from 'vitest';
import {
  buildSchoolAdminActionQueue,
  buildSchoolActivityFeed,
  isSchoolParentConfirmationPending,
  schoolParentConfirmationLabel,
  sumPendingSchoolInvoices,
} from '../../src/lib/schoolDashboard';

describe('school dashboard action queues', () => {
  it('includes every contract state that still requires a parent action', () => {
    expect(isSchoolParentConfirmationPending({ kind: 'annual', signing_status: 'sent' })).toBe(true);
    expect(isSchoolParentConfirmationPending({
      kind: 'annual',
      signing_status: 'signed_by_school',
      signatures: [{ role: 'school', status: 'signed' }],
    })).toBe(true);
    expect(isSchoolParentConfirmationPending({ kind: 'annual', signing_status: 'signed_by_school' })).toBe(false);
    expect(isSchoolParentConfirmationPending({ kind: 'annual', signing_status: 'awaiting_school_signature' })).toBe(false);
    expect(isSchoolParentConfirmationPending({ kind: 'annual', signing_status: 'signed' })).toBe(false);
    expect(isSchoolParentConfirmationPending({ kind: 'extra_lessons', signing_status: 'sent', accepted_at: null })).toBe(true);
    expect(isSchoolParentConfirmationPending({ kind: 'extra_lessons', signing_status: 'sent', accepted_at: '2026-09-10T10:00:00Z' })).toBe(false);
    expect(isSchoolParentConfirmationPending({
      kind: 'extra_lessons',
      signing_status: 'sent',
      accepted_at: null,
      withdrawal_requested_at: '2026-09-12T10:00:00Z',
    })).toBe(false);
    expect(isSchoolParentConfirmationPending({
      kind: 'annual',
      signing_status: 'sent',
      terminated_at: '2026-09-12T10:00:00Z',
    })).toBe(false);
  });

  it('labels the pending parent action clearly', () => {
    expect(schoolParentConfirmationLabel({ kind: 'annual', signing_status: 'sent' })).toBe('data');
    expect(schoolParentConfirmationLabel({ kind: 'annual', signing_status: 'signed_by_school' })).toBe('signature');
    expect(schoolParentConfirmationLabel({ kind: 'extra_lessons', signing_status: 'sent' })).toBe('offer');
  });

  it('sums only unpaid monthly invoices in cents', () => {
    expect(sumPendingSchoolInvoices([
      { total_eur: '100.10', payment_status: 'pending' },
      { total_eur: 20.20, payment_status: 'pending' },
      { total_eur: 50, payment_status: 'paid' },
      { total_eur: null, payment_status: 'pending' },
    ])).toBe(120.30);
  });

  it('derives the admin queue from live contract, payment, attendance and group state', () => {
    const actions = buildSchoolAdminActionQueue({
      now: new Date('2026-09-18T12:00:00.000Z'),
      contracts: [{
        id: 'contract-1',
        kind: 'annual',
        signing_status: 'sent',
        sent_at: '2026-09-01T10:00:00.000Z',
        student_name: 'Jonas',
      }],
      invoices: [{
        id: 'invoice-1',
        student_name: 'Jonas',
        payment_status: 'pending',
        due_date: '2026-09-10',
        total_eur: 20,
      }],
      sessions: [0, 1, 2].map((index) => ({
        id: `session-${index}`,
        student_id: 'student-1',
        student_name: 'Jonas',
        tutor_name: 'Mokytoja',
        start_time: `2026-09-${15 - index}T10:00:00.000Z`,
        end_time: `2026-09-${15 - index}T11:00:00.000Z`,
        status: 'no_show',
        status_confirmed_at: `2026-09-${15 - index}T11:05:00.000Z`,
      })),
      groups: [{
        id: 'group-1',
        name: 'Matematika 7 klasė',
        admin_action_required: true,
        admin_action_note: 'Reikia pakeisti sudėtį',
        admin_action_requested_at: '2026-09-17T10:00:00.000Z',
      }],
    });

    expect(actions.map((item) => item.id)).toEqual(expect.arrayContaining([
      'contract-parent:contract-1',
      'invoice:invoice-1',
      'three-absences:student-1',
      'group:group-1',
    ]));
  });

  it('warns when a group is below minimum before an upcoming slot', () => {
    const actions = buildSchoolAdminActionQueue({
      now: new Date('2026-10-06T10:00:00.000Z'),
      contracts: [],
      invoices: [],
      sessions: [],
      groups: [{
        id: 'group-risk',
        name: 'Lietuvių 8 klasė',
        minimum_active_students: 2,
        duration_minutes: 45,
        slots: [{ weekday: 3, start_time: '16:00', end_time: '16:45' }],
        minimum_status: { eligible_student_count: 1, unconfirmed_student_ids: ['s2'] },
      }],
    });
    expect(actions.some((item) => item.id === 'group-at-risk:group-risk')).toBe(true);
  });

  it('keeps a group below the three-student minimum in the admin queue', () => {
    const actions = buildSchoolAdminActionQueue({
      contracts: [],
      invoices: [],
      sessions: [],
      groups: [{
        id: 'group-low',
        name: 'Lietuvių 8 klasė',
        suspension_started_at: '2026-09-18T08:00:00.000Z',
        suspension_reason: 'Grupėje liko 2 aktyvūs mokiniai.',
      }],
      now: new Date('2026-09-19T10:00:00.000Z'),
    });
    expect(actions[0]).toMatchObject({ id: 'group-minimum:group-low', priority: 3 });
  });

  it('uses the configured minimum of two in paused group details', () => {
    const input = { contracts: [], invoices: [], sessions: [], groups: [{ id: 'group', name: 'STEAM', minimum_active_students: 2, suspension_started_at: '2026-09-18T08:00:00.000Z', updated_at: '2026-09-18T08:00:00.000Z' }] };
    expect(buildSchoolAdminActionQueue(input)[0].detail).toContain('mažiau nei 2');
    expect(buildSchoolActivityFeed(input)[0].detail).toContain('mažiau nei 2');
  });

  it('keeps an uploaded but unfinished contract copy in the document review queue', () => {
    const actions = buildSchoolAdminActionQueue({
      now: new Date('2026-09-18T12:00:00.000Z'),
      contracts: [{
        id: 'contract-doc',
        student_name: 'Ieva',
        signing_status: 'awaiting_school_signature',
        signed_contract_url: 'org/contracts/scan.pdf',
        created_at: '2026-09-10T08:00:00.000Z',
      }],
      invoices: [],
      sessions: [],
    });
    expect(actions.some((item) => item.id === 'contract-document:contract-doc')).toBe(true);
  });

  it('drops terminated or withdrawn contracts from the admin queue', () => {
    const actions = buildSchoolAdminActionQueue({
      now: new Date('2026-09-18T12:00:00.000Z'),
      contracts: [{
        id: 'contract-ended',
        kind: 'extra_lessons',
        signing_status: 'sent',
        sent_at: '2026-09-01T10:00:00.000Z',
        student_name: 'Jonas',
        withdrawal_requested_at: '2026-09-10T10:00:00.000Z',
      }],
      invoices: [],
      sessions: [],
    });
    expect(actions.some((item) => item.id.startsWith('contract-'))).toBe(false);
  });

  it('queues unconfirmed attendance only when the system saw the child miss a held lesson', () => {
    const now = new Date('2026-09-18T12:00:00.000Z');
    const base = {
      student_id: 'student-1',
      student_name: 'Jonas',
      tutor_name: 'Mokytoja',
      topic: 'Matematika',
      start_time: '2026-09-17T10:00:00.000Z',
      end_time: '2026-09-17T11:00:00.000Z',
      meeting_link: 'https://meet.google.com/abc',
    };
    const actions = buildSchoolAdminActionQueue({
      now,
      contracts: [],
      invoices: [],
      sessions: [
        { ...base, id: 'missed', status: 'active', tutor_joined_at: '2026-09-17T10:02:00.000Z', student_joined_at: null },
        { ...base, id: 'history', status: 'active', tutor_joined_at: null, student_joined_at: null },
        { ...base, id: 'joined', status: 'active', tutor_joined_at: '2026-09-17T10:02:00.000Z', student_joined_at: '2026-09-17T10:03:00.000Z' },
      ],
    });
    expect(actions.map((item) => item.id)).toEqual(['attendance:missed']);
  });

  it('orders the informational movement feed newest first and identifies the actor', () => {
    const feed = buildSchoolActivityFeed({
      contracts: [],
      invoices: [],
      groups: [],
      sessions: [{
        id: 'session-1',
        student_id: 'student-1',
        student_name: 'Jonas',
        tutor_name: 'Mokytoja A',
        topic: 'Matematika',
        start_time: '2026-09-17T10:00:00.000Z',
        end_time: '2026-09-17T11:00:00.000Z',
        status: 'completed',
        status_confirmed_at: '2026-09-17T11:05:00.000Z',
      }],
    });
    expect(feed[0]).toMatchObject({ actor: 'Mokytoja A', title: 'Patvirtintas lankomumas: Jonas' });
  });
});
