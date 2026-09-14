import { describe, expect, it } from 'vitest';
import { schoolSessionContractAllowsAccess } from '../../api/_lib/schoolContractAccess';

const now = new Date('2026-09-14T09:30:00.000Z');
const groupSession = {
  class_group_id: 'group-a',
  subject_id: 'subject-a',
  start_time: '2026-09-14T09:00:00.000Z',
};

describe('school lesson contract access', () => {
  it('allows a fully signed annual contract and blocks an unsigned one', () => {
    expect(schoolSessionContractAllowsAccess([
      { kind: 'annual', signing_status: 'signed' },
    ], groupSession, now)).toBe(true);
    expect(schoolSessionContractAllowsAccess([
      { kind: 'annual', signing_status: 'sent' },
    ], groupSession, now)).toBe(false);
  });

  it('blocks immediately after school-side termination', () => {
    expect(schoolSessionContractAllowsAccess([
      { kind: 'annual', signing_status: 'signed', terminated_at: '2026-09-14T09:29:00.000Z' },
    ], groupSession, now)).toBe(false);
  });

  it('requires the matching extra-lessons agreement even when an annual contract exists', () => {
    const contracts = [
      { kind: 'annual', signing_status: 'signed' },
      {
        kind: 'extra_lessons',
        signing_status: 'sent',
        class_group_id: 'group-a',
        accepted_at: null,
      },
    ];
    expect(schoolSessionContractAllowsAccess(contracts, groupSession, now)).toBe(false);
    expect(schoolSessionContractAllowsAccess(contracts, {
      ...groupSession,
      class_group_id: 'regular-group',
    }, now)).toBe(true);
  });

  it('allows an accepted matching extra agreement only inside its service window', () => {
    const contract = {
      kind: 'extra_lessons',
      signing_status: 'signed',
      class_group_id: 'group-a',
      accepted_at: '2026-09-01T10:00:00.000Z',
      start_within_14_status: 'yes',
      order_snapshot: {
        revision_label: 'test', service_name: 'Group', service_type: 'group' as const,
        platform: 'Meet', duration_minutes: 60, schedule_slots: [], schedule_label: '',
        start_date: '2026-09-10', end_date: '2026-09-30', unit_price_eur: 10,
        vat_status: '', base_lessons_per_month: 0, indicative_monthly_eur: 0,
        individual_cancel_terms: '', school_email: '', school_phone: '', data_protection_contact: '',
        group_id: 'group-a',
      },
    };
    expect(schoolSessionContractAllowsAccess([contract], groupSession, now)).toBe(true);
    expect(schoolSessionContractAllowsAccess([contract], {
      ...groupSession,
      start_time: '2026-10-01T09:00:00.000Z',
    }, now)).toBe(false);
  });
});
