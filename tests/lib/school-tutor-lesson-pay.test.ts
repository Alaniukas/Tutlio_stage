import { describe, expect, it } from 'vitest';
import { schoolTutorPayOccurrences } from '@/lib/schoolTutorLessonPay';

const now = new Date('2026-09-30T12:00:00Z');
const row = { id: 'child-1', tutor_id: 'teacher', class_group_id: 'group', subject_id: 'math',
  start_time: '2026-09-30T06:00:00Z', end_time: '2026-09-30T07:00:00Z', status: 'completed', tutor_pay_eur_snapshot: 45 };
describe('school teacher pay by meeting', () => {
  const attendance = { ...row, id: 'attendance-1', student_id: 'unsigned-child', source_kind: 'attendance' as const,
    status_confirmed_at: now.toISOString() };

  it('pays completed standalone attendance once at its historical meeting rate without session IDs', () => {
    const result = schoolTutorPayOccurrences([attendance, { ...attendance, id: 'attendance-2', student_id: 'another-child' }], 90, now, { requireConfirmation: true });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ payEur: 45, payIssue: null, sessionIds: [], attendanceIds: ['attendance-1', 'attendance-2'] });
  });

  it('lets completed standalone attendance establish a meeting with pending or cancelled real siblings', () => {
    const pending = { ...row, student_id: 'pending-child', status_confirmed_at: null, tutor_pay_eur_snapshot: 90 };
    const cancelled = { ...pending, id: 'cancelled-child', student_id: 'cancelled-child', status: 'cancelled' };
    const result = schoolTutorPayOccurrences([pending, cancelled, attendance], 0, now, { requireConfirmation: true });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ row: { status: 'completed' }, payEur: 45, sessionIds: ['child-1', 'cancelled-child'], attendanceIds: ['attendance-1'] });
  });

  it('keeps a same-child real session authoritative over standalone attendance, including cancellation', () => {
    const real = { ...row, student_id: attendance.student_id, status_confirmed_at: now.toISOString() };
    expect(schoolTutorPayOccurrences([real, { ...attendance, pay_evidence_only: true }], 0, now)[0])
      .toMatchObject({ payEur: 45, payIssue: null, sessionIds: ['child-1'], attendanceIds: ['attendance-1'] });
    expect(schoolTutorPayOccurrences([{ ...real, status: 'cancelled' }, attendance], 45, now)).toEqual([]);
  });

  it('retains original financial provenance when a later confirmed real rate conflicts with it', () => {
    const laterReal = { ...row, student_id: attendance.student_id, status_confirmed_at: now.toISOString(), tutor_pay_eur_snapshot: 90 };
    const result = schoolTutorPayOccurrences([laterReal, { ...attendance, pay_evidence_only: true }], 90, now);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ row: { status: 'completed' }, payEur: null,
      payIssue: 'conflicting_snapshot', sessionIds: ['child-1'], attendanceIds: ['attendance-1'] });
  });

  it('uses evidence-only rates without letting that history establish a conducted meeting', () => {
    const evidence = { ...attendance, pay_evidence_only: true };
    expect(schoolTutorPayOccurrences([evidence], 45, now)).toEqual([]);
    expect(schoolTutorPayOccurrences([{ ...row, status: 'active' }, evidence], 45, now)).toEqual([]);
    const real = { ...row, student_id: 'other-child', status_confirmed_at: now.toISOString(), tutor_pay_eur_snapshot: null };
    expect(schoolTutorPayOccurrences([real, { ...evidence, status: 'no_show' }], 90, now)[0])
      .toMatchObject({ payEur: 45, payIssue: null, sessionIds: ['child-1'], attendanceIds: ['attendance-1'] });
  });

  it.each(['active', 'completed', 'no_show'])('preserves prior completed attendance when a same-child %s row is later materialized without confirmation', (status) => {
    const materialized = { ...row, id: 'later-real-session', student_id: attendance.student_id,
      status, status_confirmed_at: null, tutor_pay_eur_snapshot: 90 };
    for (const requireConfirmation of [true, false]) {
      const before = schoolTutorPayOccurrences([attendance], 90, now, { requireConfirmation })[0];
      const after = schoolTutorPayOccurrences([materialized, attendance], 90, now, { requireConfirmation });
      expect(after).toHaveLength(1);
      expect(after[0]).toMatchObject({ key: before.key, payEur: 45, payIssue: null,
        sessionIds: ['later-real-session'], attendanceIds: ['attendance-1'] });
    }
  });

  it('does not treat standalone absence or unstamped attendance as a conducted meeting', () => {
    for (const patch of [{ status: 'no_show' }, { status_confirmed_at: null }]) {
      expect(schoolTutorPayOccurrences([{ ...attendance, ...patch }], 45, now)).toEqual([]);
    }
    expect(schoolTutorPayOccurrences([{ ...row, status: 'no_show' }, { ...attendance, status: 'no_show' }], 45, now)[0])
      .toMatchObject({ sessionIds: ['child-1'], attendanceIds: ['attendance-1'], payEur: 45 });
  });

  it('blocks conflicting historical rates across real and standalone attended children', () => {
    const real = { ...row, student_id: 'confirmed-child', status_confirmed_at: now.toISOString() };
    expect(schoolTutorPayOccurrences([real, { ...attendance, tutor_pay_eur_snapshot: 90 }], 30, now)[0])
      .toMatchObject({ payEur: null, payIssue: 'conflicting_snapshot', sessionIds: ['child-1'], attendanceIds: ['attendance-1'] });
  });

  it('requires an explicit teacher or administrator outcome before paying an elapsed meeting', () => {
    const options = { requireConfirmation: true };
    expect(schoolTutorPayOccurrences([row], 45, now, options)).toEqual([]);
    for (const status_confirmed_by of ['teacher', 'administrator']) {
      const confirmed = { ...row, status_confirmed_at: now.toISOString(), status_confirmed_by };
      expect(schoolTutorPayOccurrences([confirmed], 45, now, options)[0].payEur).toBe(45);
    }
    expect(schoolTutorPayOccurrences([row], 45, now)).toHaveLength(1);
  });
  it('ignores unconfirmed sibling snapshots while paying a confirmed group once', () => {
    const confirmed = { ...row, status_confirmed_at: now.toISOString() };
    const pending = { ...row, id: 'pending-child', tutor_pay_eur_snapshot: 90 };
    expect(schoolTutorPayOccurrences([pending, confirmed], 45, now, { requireConfirmation: true })[0])
      .toMatchObject({ payEur: 45, payIssue: null, sessionIds: ['pending-child', 'child-1'] });
  });
  it('pays a mixed group once and retains all attendance row ids', () => {
    const result = schoolTutorPayOccurrences([row, { ...row, id: 'child-2', status: 'no_show' }], 0, now);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ payEur: 45, payIssue: null, sessionIds: ['child-1', 'child-2'], row: { status: 'completed' } });
  });
  it('uses the coherent historical snapshot independently of child ordering or current zero rate', () => {
    for (const rows of [[row, { ...row, id: 'child-2', tutor_pay_eur_snapshot: null }],
      [{ ...row, id: 'child-2', tutor_pay_eur_snapshot: null }, row]]) {
      expect(schoolTutorPayOccurrences(rows, 0, now)[0].payEur).toBe(45);
    }
  });
  it('preserves an explicit zero snapshot while unresolved configuration remains missing', () => {
    expect(schoolTutorPayOccurrences([{ ...row, tutor_pay_eur_snapshot: 0 }], 45, now)[0]).toMatchObject({ payEur: 0, payIssue: null });
    expect(schoolTutorPayOccurrences([{ ...row, tutor_pay_eur_snapshot: null }], 0, now)[0]).toMatchObject({ payEur: null, payIssue: 'missing_rate' });
    expect(schoolTutorPayOccurrences([{ ...row, tutor_pay_eur_snapshot: null }], 30, now)[0].payEur).toBe(30);
  });
  it('flags contradictory snapshots instead of choosing an arbitrary child', () => {
    expect(schoolTutorPayOccurrences([row, { ...row, id: 'child-2', tutor_pay_eur_snapshot: 20 }], 30, now)[0])
      .toMatchObject({ payEur: null, payIssue: 'conflicting_snapshot' });
  });
  it('keeps pay identical for a full server occurrence and a conducted-only preview', () => {
    const extra = ['active', 'cancelled', 'no_show'].map((status, index) => ({ ...row, id: `pending-${index}`, status,
      no_show_reason: 'missed_join', status_confirmed_at: null, tutor_pay_eur_snapshot: 90 }));
    const full = schoolTutorPayOccurrences([row, ...extra], 0, now)[0];
    const preview = schoolTutorPayOccurrences([row, extra[2]], 0, now)[0];
    expect(full.payEur).toBe(preview.payEur);
    expect(full.payEur).toBe(45);
    expect(full.sessionIds).toHaveLength(4);
  });
  it('keeps automatic unconfirmed absence pending and requires a valid ended meeting', () => {
    for (const other of [{ status: 'no_show', no_show_reason: 'missed_join', status_confirmed_at: null },
      { status: 'active' }, { status: 'cancelled' }, { end_time: '2026-10-01T12:00:00Z' }, { end_time: null }]) {
      expect(schoolTutorPayOccurrences([{ ...row, ...other }], 45, now)).toHaveLength(0);
    }
    expect(schoolTutorPayOccurrences([{ ...row, status: 'no_show', no_show_reason: 'missed_join', status_confirmed_at: now.toISOString() }], 45, now)).toHaveLength(1);
  });
  it('groups subject-based lessons and timestamp aliases without merging different tutors or individual lessons', () => {
    const grouped = { ...row, class_group_id: null, subjects: { is_group: true } };
    expect(schoolTutorPayOccurrences([grouped, { ...grouped, id: 'child-2', start_time: '2026-09-30T09:00:00+03:00' }], 45, now)).toHaveLength(1);
    expect(schoolTutorPayOccurrences([grouped, { ...grouped, id: 'child-2', tutor_id: 'other' }], 45, now)).toHaveLength(2);
    expect(schoolTutorPayOccurrences([{ ...grouped, subjects: null }, { ...grouped, id: 'child-2', subjects: null }], 45, now)).toHaveLength(2);
  });
});
