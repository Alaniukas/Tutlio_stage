import { describe, expect, it } from 'vitest';
import { recordingGrantsForMember, recordingModesForMember, type RecordingPlanContract } from '../../src/lib/schoolRecordingPlan';
import { buildExtraLessonsOrderSnapshot, canonicalExtraLessonsPayload, mergeExtraLessonsOrderPatch, validateExtraLessonsOffer, validateExtraLessonsOrder } from '../../src/lib/extraLessonsContract';

const now = new Date('2026-09-28T12:00:00Z');
const monday = [{ weekday: 1, start_time: '18:00' }];
const thursday = [{ weekday: 4, start_time: '18:00' }];
const parties = { contract_number: 'QA', student_name: 'Vaikas', student_grade: '3', parent_name: 'Tėvas', parent_email: 'qa@school.invalid', parent_phone: '+37060000000', user_id: 'child', school_name: 'Demo' };
const agreement = (mode?: 'schedule' | 'group' | 'none'): RecordingPlanContract => ({
  id: 'accepted', student_id: 'child', signing_status: 'signed', accepted_at: '2026-09-01T12:00:00Z',
  order_snapshot: { start_date: '2026-09-01', end_date: '2027-06-15', ...(mode ? { recording_access: mode } : {}), schedule_slots: thursday },
});

describe('school child/group recording plan', () => {
  it('preserves legacy selected-slot grants despite a later membership denial', () => {
    expect(recordingGrantsForMember('none', monday, [agreement()], now)).toEqual([{ mode: 'schedule', scheduleSlots: monday }]);
    expect(recordingModesForMember(undefined, [], now)).toEqual(['schedule']);
  });

  it('unions valid competing grants, including a whole-group agreement', () => {
    expect(recordingModesForMember('none', [agreement('none')], now)).toEqual(['none']);
    expect(recordingModesForMember('none', [agreement('none'), { ...agreement('group'), id: 'second' }], now)).toEqual(['none', 'group']);
    expect(recordingGrantsForMember('none', monday, [agreement('schedule')], now)).toEqual([{ mode: 'schedule', scheduleSlots: thursday }]);
  });

  it.each([
    { terminated_at: '2026-09-20' }, { archived_at: '2026-09-20' }, { withdrawal_requested_at: '2026-09-20' },
    { accepted_at: null }, { suspension_started_at: '2026-09-20', suspension_scope: 'individual' },
    { order_snapshot: { ...agreement('group').order_snapshot, start_date: '2026-10-01' } },
    { order_snapshot: { ...agreement('group').order_snapshot, end_date: '2026-09-27' } },
    { accepted_at: '2026-09-27T12:00:00Z', start_within_14_status: 'no' },
  ])('does not let an inactive explicit agreement fall back to stored group access (%j)', (change) => {
    expect(recordingModesForMember('group', [{ ...agreement('group'), ...change }], now)).toEqual(['none']);
  });

  it('retains recordings while the whole group is temporarily below its minimum', () => {
    expect(recordingModesForMember('none', [{ ...agreement('group'), suspension_started_at: '2026-09-20', suspension_scope: 'group_under_minimum' }], now)).toEqual(['group']);
  });

  it('freezes an offered no-recording plan and its agreed price against public-form patches', () => {
    const offered = buildExtraLessonsOrderSnapshot({ service_name: 'STEAM', service_type: 'group', group_id: 'group', recording_access: 'none', schedule_slots: monday,
      start_date: '2026-10-01', end_date: '2027-06-15', duration_minutes: 45, unit_price_eur: 9, base_lessons_per_month: 4 });
    expect(validateExtraLessonsOffer(offered)).toEqual([]);
    expect(validateExtraLessonsOrder(offered)).toEqual([]);
    const attempted = mergeExtraLessonsOrderPatch(offered, { recording_access: 'group', group_id: 'other', service_type: 'individual', schedule_slots: thursday, unit_price_eur: 1, base_lessons_per_month: 1 });
    expect(attempted).toMatchObject({ recording_access: 'none', group_id: 'group', service_type: 'group', schedule_slots: monday, unit_price_eur: 9, base_lessons_per_month: 4 });
    const payload = canonicalExtraLessonsPayload({ ...parties, order: offered });
    expect(payload.paslaugos_pavadinimas).toContain('Be įrašų');
    expect(payload.recording_access).toBe('none');
    expect(validateExtraLessonsOrder({ ...offered, schedule_slots: [...monday, ...thursday] })).toContain('recording_access');
  });

  it('keeps legacy public-form behavior and canonical payloads without inventing access fields', () => {
    const legacy = buildExtraLessonsOrderSnapshot({ service_name: 'STEAM', unit_price_eur: 6 });
    expect(legacy).not.toHaveProperty('recording_access');
    expect(mergeExtraLessonsOrderPatch(legacy, { unit_price_eur: 8, recording_access: 'group' })).toMatchObject({ unit_price_eur: 8 });
    expect(mergeExtraLessonsOrderPatch(legacy, { recording_access: 'group' })).not.toHaveProperty('recording_access');
    expect(canonicalExtraLessonsPayload({ ...parties, order: legacy })).not.toHaveProperty('recording_access');
  });
});
