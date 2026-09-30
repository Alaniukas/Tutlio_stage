import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows } from '../../src/lib/fetchAllRows.js';
import { schoolDate } from '../../src/lib/schoolTime.js';
import type { SchoolTutorPayRow } from '../../src/lib/schoolTutorLessonPay.js';

export class SchoolTutorAttendancePayPeriodError extends Error {}
export type SchoolTutorAttendancePayRow = SchoolTutorPayRow & {
  id: string; source_kind: 'attendance'; pay_evidence_only: boolean; class_group: { name: string; calendar_name: null };
};

/** Inclusive Lithuanian calendar dates; a financial export is bounded to one year. */
export function schoolTutorAttendancePayPeriod(periodStart: string, periodEnd: string) {
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!valid(periodStart) || !valid(periodEnd) || periodEnd < periodStart
    || Date.parse(`${periodEnd}T00:00:00Z`) - Date.parse(`${periodStart}T00:00:00Z`) > 366 * 86400000) {
    throw new SchoolTutorAttendancePayPeriodError('Invalid school teacher pay period');
  }
  const from = schoolDate(periodStart), until = schoolDate(periodEnd);
  until.setDate(until.getDate() + 1);
  return { from, until };
}

/** Attendance evidence supplements child sessions without becoming child billing. */
export async function loadSchoolTutorAttendancePayRows(db: SupabaseClient, input: {
  tutorId: string; organizationId: string; periodStart: string; periodEnd: string; now?: Date;
}): Promise<SchoolTutorAttendancePayRow[]> {
  const { from, until } = schoolTutorAttendancePayPeriod(input.periodStart, input.periodEnd);
  const now = input.now ?? new Date();
  const attendance = await fetchAllRows<any>((first, last) => db.from('school_group_attendance_attestations')
    .select('id,group_id,student_id,tutor_id,start_time,end_time,status,confirmed_at,group_name,anchor_session_id,tutor_pay_eur_snapshot')
    .eq('organization_id', input.organizationId).eq('tutor_id', input.tutorId).in('status', ['completed', 'no_show'])
    .gte('start_time', from.toISOString()).lt('start_time', until.toISOString()).lte('end_time', now.toISOString())
    .order('start_time').order('id').range(first, last));
  if (!attendance.length) return [];
  const groups = [...new Set<string>(attendance.map(row => row.group_id))];
  const anchors = [...new Set<string>(attendance.flatMap(row => row.anchor_session_id ? [row.anchor_session_id] : []))];
  const realRows: any[] = [];
  for (let first = 0; first < groups.length; first += 100) {
    realRows.push(...await fetchAllRows<any>((offset, last) => db.from('sessions')
      .select('id,class_group_id,student_id,tutor_id,start_time,status,status_confirmed_at,no_show_reason')
      .in('class_group_id', groups.slice(first, first + 100)).eq('tutor_id', input.tutorId)
      .gte('start_time', from.toISOString()).lt('start_time', until.toISOString())
      .order('start_time').order('id').range(offset, last)));
  }
  const anchoredRows: any[] = [];
  for (let first = 0; first < anchors.length; first += 100) {
    anchoredRows.push(...await fetchAllRows<any>((offset, last) => db.from('sessions')
      .select('id,student_id,tutor_id,status,status_confirmed_at,no_show_reason').in('id', anchors.slice(first, first + 100)).order('id').range(offset, last)));
  }
  const key = (group: string, student: string, start: string) => `${group}|${student}|${Date.parse(start)}`;
  const authoritative = (row: any) => ['cancelled', 'canceled'].includes(row.status)
    || (['completed', 'no_show'].includes(row.status) && Boolean(row.status_confirmed_at));
  const realOccurrences = new Set(realRows.filter(authoritative).map(row => key(row.class_group_id, row.student_id, row.start_time)));
  const anchorsById = new Map(anchoredRows.filter(row => row.tutor_id === input.tutorId).map(row => [row.id, row.student_id]));
  return attendance.flatMap(row => {
    // Preserve historical pay provenance even when real history supersedes the
    // outcome. The projection may use that rate but cannot conduct a meeting from it.
    const evidenceOnly = row.status === 'no_show' || realOccurrences.has(key(row.group_id, row.student_id, row.start_time))
      || Boolean(row.anchor_session_id && anchorsById.get(row.anchor_session_id) === row.student_id);
    if ((row.status === 'no_show' && row.tutor_pay_eur_snapshot == null)
      || !row.confirmed_at || !Number.isFinite(Date.parse(row.confirmed_at))
      || !Number.isFinite(Date.parse(row.start_time)) || !Number.isFinite(Date.parse(row.end_time))
      || Date.parse(row.end_time) <= Date.parse(row.start_time) || Date.parse(row.end_time) > now.getTime()) return [];
    return [{ id: row.id, source_kind: 'attendance' as const, pay_evidence_only: evidenceOnly, class_group_id: row.group_id,
      tutor_id: row.tutor_id, student_id: row.student_id, start_time: row.start_time, end_time: row.end_time,
      status: row.status, status_confirmed_at: row.confirmed_at, tutor_pay_eur_snapshot: row.tutor_pay_eur_snapshot,
      class_group: { name: row.group_name, calendar_name: null } }];
  });
}
