import { classGroupCalendarLabel, memberFollowsGroupSlot, type SchoolClassGroupRecord } from './schoolClassGroups.js';
import { schoolDate } from './schoolTime.js';

export type SchoolGroupAttendance = {
  id: string;
  status: 'completed' | 'no_show';
  statusConfirmedAt: string;
  contractConfirmed: boolean;
};

export type SchoolGroupAttendanceParticipant = {
  studentId: string;
  contractConfirmed: boolean;
  contractRequired?: boolean;
  canConfirmAttendance: boolean;
  realSessionId?: string | null;
  attendance: SchoolGroupAttendance | null;
};

export type SchoolGroupAttendanceTarget =
  | { anchorSessionId: string }
  | { groupId: string; startTime: string };

export function schoolGroupAttendanceQuery(target: SchoolGroupAttendanceTarget): string {
  return new URLSearchParams(Object.entries(target)).toString();
}

export async function confirmSchoolGroupRosterAttendance(
  target: SchoolGroupAttendanceTarget,
  studentId: string,
  status: 'completed' | 'no_show',
  headers: Record<string, string>,
): Promise<SchoolGroupAttendance> {
  const response = await fetch('/api/school-group-attendance', {
    method: 'POST', headers,
    body: JSON.stringify({ ...target, studentId, status }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.attendance) throw new Error(String(data.error || response.status));
  return data.attendance;
}

export type AttendanceOnlyGroupOccurrence = {
  id: string;
  tutor_id: string;
  student_id: string;
  class_group_id: string;
  start_time: Date;
  end_time: Date;
  status: 'active';
  paid: false;
  topic: string;
  _attendanceOnly: true;
  _isClassGroup: true;
  _classGroupId: string;
  _classGroupName: string;
};

/** Read-only roster entry for ended canonical slots with no actual lesson row. */
export function attendanceOnlyGroupOccurrences(
  groups: SchoolClassGroupRecord[],
  sessions: Array<{ class_group_id?: string | null; start_time: Date }>,
  window: { start: Date; end: Date; now?: Date; tutorId?: string },
): AttendanceOnlyGroupOccurrence[] {
  const nowMs = (window.now || new Date()).getTime();
  const existing = new Set(sessions.filter((row) => row.class_group_id)
    .map((row) => `${row.class_group_id}:${new Date(row.start_time).getTime()}`));
  const first = schoolDate(window.start);
  const last = schoolDate(window.end);
  const day = new Date(Date.UTC(first.getFullYear(), first.getMonth(), first.getDate()));
  const lastDay = Date.UTC(last.getFullYear(), last.getMonth(), last.getDate());
  const occurrences: AttendanceOnlyGroupOccurrence[] = [];
  const seen = new Set<string>();
  // Calendar views cover at most six weeks. Keep this bounded for malformed windows.
  for (let count = 0; day.getTime() <= lastDay && count < 62; count += 1, day.setUTCDate(day.getUTCDate() + 1)) {
    const ymd = day.toISOString().slice(0, 10);
    for (const group of groups) {
      if (window.tutorId !== undefined && group.tutor_id !== window.tutorId) continue;
      if (!group.members?.length || ymd < group.school_year_start || ymd > group.school_year_end) continue;
      for (const slot of group.slots || []) {
        if (Number(slot.weekday) !== day.getUTCDay() || !/^\d{2}:\d{2}/.test(slot.start_time)) continue;
        const start = schoolDate(`${ymd}T${slot.start_time.slice(0, 5)}`);
        const duration = Math.max(15, Number(group.duration_minutes) || 45);
        const slotEnd = /^\d{2}:\d{2}/.test(slot.end_time)
          ? schoolDate(`${ymd}T${slot.end_time.slice(0, 5)}`) : null;
        const end = slotEnd && slotEnd.getTime() > start.getTime()
          ? slotEnd : new Date(start.getTime() + duration * 60_000);
        const key = `${group.id}:${start.getTime()}`;
        if (start < window.start || start > window.end || end.getTime() > nowMs
          || existing.has(key) || seen.has(key)) continue;
        const startMs = start.getTime();
        const eligibleMember = group.members.some((member) => {
          if (!member.student_id || !memberFollowsGroupSlot(member.schedule_slots, slot)) return false;
          if (member.enrolled_at && Date.parse(member.enrolled_at) > startMs) return false;
          return !(group.recurrence_exclusions || []).some((exclusion) => {
            if (exclusion.student_id && exclusion.student_id !== member.student_id) return false;
            if (exclusion.scope === 'all') return true;
            const excludedMs = Date.parse(exclusion.start_time || '');
            return Number.isFinite(excludedMs)
              && (exclusion.scope === 'future' ? startMs >= excludedMs : startMs === excludedMs);
          });
        });
        if (!eligibleMember) continue;
        seen.add(key);
        const name = classGroupCalendarLabel(group);
        occurrences.push({
          id: `classgroup_attendance_${key}`, tutor_id: group.tutor_id, student_id: '', class_group_id: group.id,
          start_time: new Date(start), end_time: new Date(end), status: 'active', paid: false, topic: name,
          _attendanceOnly: true, _isClassGroup: true, _classGroupId: group.id, _classGroupName: name,
        });
      }
    }
  }
  return occurrences;
}
