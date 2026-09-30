import type { SupabaseClient } from '@supabase/supabase-js';
import { wallClockToUtc } from './recurringOccurrences.js';
import type { SchoolAccessContract } from './schoolContractAccess.js';
import { classGroupCalendarLabel, memberFollowsGroupSlot, type SchoolMemberSlot } from '../../src/lib/schoolClassGroups.js';
import { isSessionOccurrenceExcluded, loadSessionRecurrenceExclusions } from './sessionRecurrenceExclusions.js';

export class AttendanceRequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export type AttendanceGroup = {
  id: string; organization_id: string; tutor_id: string; name: string; calendar_name?: string | null;
  school_year_start: string; school_year_end: string; duration_minutes?: number | null;
  slots: Array<{ weekday: number; start_time: string; end_time: string }>;
};
export type AttendanceOccurrence = { group: AttendanceGroup; anchorSessionId: string | null; startTime: string; endTime: string; slot: SchoolMemberSlot };

function occurrenceWallClock(startTime: string) {
  const date = new Date(startTime);
  if (!Number.isFinite(date.getTime())) throw new AttendanceRequestError(400, 'invalid_occurrence');
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Vilnius', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date).map(p => [p.type, p.value]));
  const ymd = `${parts.year}-${parts.month}-${parts.day}`;
  return { ymd, time: `${parts.hour}:${parts.minute}`, weekday: new Date(`${ymd}T12:00:00Z`).getUTCDay() };
}

/** No client-supplied end time or arbitrary unscheduled lesson can become an attestation. */
export function canonicalAttendanceOccurrence(group: AttendanceGroup, startTime: string): Omit<AttendanceOccurrence, 'anchorSessionId'> {
  const wall = occurrenceWallClock(startTime);
  const start = new Date(startTime);
  if (wall.ymd < group.school_year_start || wall.ymd > group.school_year_end) {
    throw new AttendanceRequestError(409, 'outside_school_year');
  }
  const slot = group.slots.find(s => Number(s.weekday) === wall.weekday && s.start_time.slice(0, 5) === wall.time);
  if (!slot || wallClockToUtc(wall.ymd, slot.start_time).getTime() !== start.getTime()) {
    throw new AttendanceRequestError(409, 'unscheduled_occurrence');
  }
  let end = wallClockToUtc(wall.ymd, slot.end_time);
  if (end.getTime() <= start.getTime()) end = new Date(start.getTime() + Math.max(15, Number(group.duration_minutes) || 45) * 60000);
  return { group, startTime: start.toISOString(), endTime: end.toISOString(), slot: { weekday: wall.weekday, start_time: wall.time } };
}

export async function loadAttendanceOccurrence(db: SupabaseClient, input: { anchorSessionId?: string; groupId?: string; startTime?: string }): Promise<AttendanceOccurrence> {
  let groupId = input.groupId || '';
  let anchor: any = null;
  if (input.anchorSessionId) {
    const result = await db.from('sessions').select('id,class_group_id,tutor_id,start_time,end_time').eq('id', input.anchorSessionId).maybeSingle();
    if (result.error) throw result.error;
    if (!result.data?.class_group_id) throw new AttendanceRequestError(404, 'group_occurrence_not_found');
    anchor = result.data; groupId = anchor.class_group_id;
  }
  if (!groupId) throw new AttendanceRequestError(400, 'missing_occurrence');
  const result = await db.from('school_class_groups')
    .select('id,organization_id,tutor_id,name,calendar_name,school_year_start,school_year_end,duration_minutes,slots:school_class_group_slots(weekday,start_time,end_time)')
    .eq('id', groupId).maybeSingle();
  if (result.error) throw result.error;
  if (!result.data) throw new AttendanceRequestError(404, 'group_not_found');
  const group = result.data as unknown as AttendanceGroup;
  if (!anchor) return { ...canonicalAttendanceOccurrence(group, input.startTime || ''), anchorSessionId: null };
  // Existing history remains authoritative when the school later edits its weekly slot.
  if (anchor.tutor_id !== group.tutor_id || !Number.isFinite(Date.parse(anchor.start_time))
      || !Number.isFinite(Date.parse(anchor.end_time)) || Date.parse(anchor.end_time) <= Date.parse(anchor.start_time)) {
    throw new AttendanceRequestError(409, 'invalid_anchor');
  }
  const wall = occurrenceWallClock(anchor.start_time);
  return { group, anchorSessionId: anchor.id, startTime: new Date(anchor.start_time).toISOString(), endTime: new Date(anchor.end_time).toISOString(),
    slot: { weekday: wall.weekday, start_time: wall.time } };
}

export function attendanceResponse(row: any) {
  return row ? { id: row.id, status: row.status, statusConfirmedAt: row.confirmed_at, contractConfirmed: row.contract_confirmed } : null;
}

export function attendanceContractConfirmed(contracts: SchoolAccessContract[], occurrence: { groupId: string; startTime: string }, extraContractRequired: boolean) {
  const matching = contracts.filter(c => c.kind === 'extra_lessons' && (c.class_group_id || c.order_snapshot?.group_id) === occurrence.groupId);
  if (!matching.length) return !extraContractRequired;
  const atMs = Date.parse(occurrence.startTime);
  if (!Number.isFinite(atMs)) return false;
  const happenedBy = (stamp?: string | null) => Boolean(stamp && Number.isFinite(Date.parse(stamp)) && Date.parse(stamp) <= atMs);
  const ymd = occurrenceWallClock(occurrence.startTime).ymd;
  // Confirmation records the agreement at the occurrence, independently of service cooldowns or suspension.
  // Later acceptance, archival or termination must not rewrite its historical state.
  return matching.some(c => c.signing_status === 'signed' && happenedBy(c.accepted_at)
    && !happenedBy(c.archived_at) && !happenedBy(c.terminated_at) && !happenedBy(c.withdrawal_requested_at)
    && (!c.order_snapshot?.start_date || ymd >= c.order_snapshot.start_date)
    && (!c.order_snapshot?.end_date || ymd <= c.order_snapshot.end_date));
}

export async function loadAttendanceParticipants(db: SupabaseClient, occurrence: AttendanceOccurrence, now = new Date(), extraContractRequired = false) {
  const { group, startTime, endTime } = occurrence;
  const roster = await db.from('school_class_group_members').select('student_id,enrolled_at,schedule_slots').eq('group_id', group.id);
  if (roster.error) throw roster.error;
  const members = roster.data || [];
  const ids = members.map(m => m.student_id);
  if (!ids.length) return [];
  const [students, sessions, contracts, attestations, exclusions, tutor] = await Promise.all([
    db.from('students').select('id,organization_id,full_name,detached_at').in('id', ids),
    db.from('sessions').select('id,student_id,status').eq('class_group_id', group.id).eq('start_time', startTime),
    db.from('school_contracts').select('*').eq('organization_id', group.organization_id).in('student_id', ids),
    db.from('school_group_attendance_attestations').select('id,student_id,status,confirmed_at,contract_confirmed')
      .eq('group_id', group.id).eq('start_time', startTime),
    loadSessionRecurrenceExclusions(db, { classGroupId: group.id }),
    db.from('profiles').select('full_name').eq('id', group.tutor_id).maybeSingle(),
  ]);
  for (const result of [students, sessions, contracts, attestations, tutor]) if (result.error) throw result.error;
  const ended = Date.parse(endTime) <= now.getTime();
  const occurrenceCancelled = Boolean(sessions.data?.length && sessions.data.every(s => ['cancelled', 'canceled'].includes(s.status)));
  return members.map(member => {
    const student = students.data?.find(s => s.id === member.student_id);
    const session = sessions.data?.find(s => s.student_id === member.student_id);
    const attendance = attestations.data?.find(a => a.student_id === member.student_id);
    const studentContracts = (contracts.data || []).filter((c: any) => c.student_id === member.student_id) as SchoolAccessContract[];
    const contractRequired = extraContractRequired || studentContracts.some(c => c.kind === 'extra_lessons'
      && (c.class_group_id || c.order_snapshot?.group_id) === group.id);
    const contractConfirmed = attendanceContractConfirmed(studentContracts, { groupId: group.id, startTime }, extraContractRequired);
    let reason: string | null = null;
    if (!ended) reason = 'lesson_not_ended';
    else if (occurrenceCancelled) reason = 'occurrence_cancelled';
    else if (!student || student.organization_id !== group.organization_id || student.detached_at) reason = 'student_not_active';
    else if (member.enrolled_at && Date.parse(member.enrolled_at) > Date.parse(startTime)) reason = 'not_enrolled_at_occurrence';
    else if (!memberFollowsGroupSlot(member.schedule_slots, occurrence.slot)) reason = 'not_in_occurrence_schedule';
    else if (isSessionOccurrenceExcluded(exclusions, member.student_id, startTime)) reason = 'occurrence_deleted';
    else if (session) reason = 'use_existing_session';
    return { studentId: member.student_id, studentName: student?.full_name || '', tutorName: tutor.data?.full_name || '',
      groupName: classGroupCalendarLabel(group as any), contractConfirmed, contractRequired, canConfirmAttendance: !reason,
      unavailableReason: reason, realSessionId: session?.id || null, attendance: attendanceResponse(attendance) };
  });
}

/** Existing session status still uses its normal confirmation/package path; only the alert is independent. */
export async function recordExistingSchoolAttendance(db: SupabaseClient, session: any, actorId: string, confirmedAt: string) {
  if (!session.class_group_id || !['completed', 'no_show'].includes(session.status)) return;
  const groupResult = await db.from('school_class_groups').select('id,organization_id,name,calendar_name').eq('id', session.class_group_id).maybeSingle();
  if (groupResult.error) throw groupResult.error;
  const group = groupResult.data;
  if (!group) return;
  const org = await db.from('organizations').select('entity_type,features').eq('id', group.organization_id).maybeSingle();
  if (org.error) throw org.error;
  if (org.data?.entity_type !== 'school') return;
  const [contracts, student, tutor, saved] = await Promise.all([
    db.from('school_contracts').select('*').eq('organization_id', group.organization_id).eq('student_id', session.student_id),
    db.from('students').select('full_name').eq('id', session.student_id).maybeSingle(),
    db.from('profiles').select('full_name').eq('id', session.tutor_id).maybeSingle(),
    db.from('school_group_attendance_attestations').select('id').eq('group_id', group.id).eq('student_id', session.student_id)
      .eq('start_time', session.start_time).maybeSingle(),
  ]);
  for (const result of [contracts, student, tutor]) if (result.error) throw result.error;
  // Existing lesson confirmation remains usable during the additive migration overlap.
  if (saved.error?.code === '42P01' || saved.error?.code === 'PGRST205') return { pending: true };
  if (saved.error) throw saved.error;
  const contractConfirmed = attendanceContractConfirmed(contracts.data as SchoolAccessContract[] || [],
    { groupId: group.id, startTime: session.start_time }, org.data.features?.school_extra_lessons_contract === true);
  if (contractConfirmed && !saved.data) return;
  const result = await db.rpc('save_school_group_attendance', { p_record: {
    organization_id: group.organization_id, group_id: group.id, student_id: session.student_id, tutor_id: session.tutor_id,
    anchor_session_id: session.id, start_time: session.start_time, end_time: session.end_time,
    status: session.status, contract_confirmed: contractConfirmed, confirmed_by: actorId, confirmed_at: confirmedAt,
    student_name: student.data?.full_name || '', tutor_name: tutor.data?.full_name || '', group_name: classGroupCalendarLabel(group as any),
  } });
  if (result.error?.code === 'PGRST202') return { pending: true };
  if (result.error || !result.data) throw result.error || new Error('Attendance notification was not saved');
}
