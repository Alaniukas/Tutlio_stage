import { isArchivedEnrollmentStatus, suggestSchoolYear } from './schoolStudentEnrollment';

export type SchoolClassGroupSlot = {
  weekday: number;
  start_time: string;
  end_time: string;
};

export type SchoolClassGroupDraft = {
  name: string;
  tutor_id: string;
  subject_id?: string | null;
  school_year_start: string;
  school_year_end: string;
  platform?: string;
  duration_minutes?: number;
  meeting_link?: string | null;
  slots: SchoolClassGroupSlot[];
};

export type SchoolClassGroupMember = {
  student_id: string;
  student?: { full_name: string } | null;
};

export type SchoolClassGroupRecord = SchoolClassGroupDraft & {
  id: string;
  members?: SchoolClassGroupMember[];
};

export type SchoolClassGroupWrite = SchoolClassGroupDraft & {
  student_ids: string[] | null;
};

export type ScheduleSlotInput = {
  weekday: number;
  start_time: string;
  end_time?: string | null;
};

export function addMinutesToTime(hhmm: string, minutes: number): string {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  const total = (h || 0) * 60 + (m || 0) + minutes;
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
}

export function withSlotEnds(slots: ScheduleSlotInput[], durationMinutes: number): SchoolClassGroupSlot[] {
  const duration = Math.max(15, Number(durationMinutes) || 45);
  return slots.map((slot) => {
    const start = String(slot.start_time || '16:00').slice(0, 5);
    const safeStart = /^\d{2}:\d{2}$/.test(start) ? start : '16:00';
    return {
      weekday: Number(slot.weekday),
      start_time: safeStart,
      end_time: addMinutesToTime(safeStart, duration),
    };
  });
}

export function addGroupScheduleSlot(
  slots: ScheduleSlotInput[],
  durationMinutes: number,
  weekdayOptions: number[] = [1, 2, 3, 4, 5, 6, 0],
): SchoolClassGroupSlot[] {
  const used = new Set(slots.map((slot) => Number(slot.weekday)));
  const weekday = weekdayOptions.find((day) => !used.has(day)) ?? weekdayOptions[0] ?? 1;
  const start = String(slots[slots.length - 1]?.start_time || '16:00').slice(0, 5);
  return withSlotEnds([...slots, { weekday, start_time: start }], durationMinutes);
}

export function updateGroupScheduleSlot(
  slots: ScheduleSlotInput[],
  index: number,
  patch: Partial<Pick<SchoolClassGroupSlot, 'weekday' | 'start_time'>>,
  durationMinutes: number,
): SchoolClassGroupSlot[] {
  return withSlotEnds(
    slots.map((slot, i) => (i === index ? { ...slot, ...patch } : slot)),
    durationMinutes,
  );
}

export function removeGroupScheduleSlot(
  slots: ScheduleSlotInput[],
  index: number,
  options?: { allowEmpty?: boolean },
): ScheduleSlotInput[] {
  if (slots.length <= 1 && options?.allowEmpty === false) return slots;
  return slots.filter((_, i) => i !== index);
}

export function normalizeGroupSlots(
  slots: Array<{ weekday: number; start_time: string; end_time?: string | null }>,
  durationMinutes: number,
): SchoolClassGroupSlot[] {
  return withSlotEnds(slots, durationMinutes)
    .filter((slot) => Number.isFinite(slot.weekday) && slot.weekday >= 0 && slot.weekday <= 6 && /^\d{2}:\d{2}$/.test(slot.start_time))
    .sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time));
}

export function defaultSchoolYearRange(now = new Date()): { start: string; end: string } {
  const [startY, endY] = suggestSchoolYear(now).split('/');
  return { start: `${startY}-09-01`, end: `${endY}-06-15` };
}

export function validateSchoolClassGroup(draft: SchoolClassGroupDraft): string[] {
  const errors: string[] = [];
  if (!String(draft.name || '').trim()) errors.push('name');
  if (!draft.tutor_id) errors.push('tutor_id');
  if (!draft.school_year_start) errors.push('school_year_start');
  if (!draft.school_year_end) errors.push('school_year_end');
  if (!draft.slots.length) errors.push('slots');
  for (const slot of draft.slots) {
    if (slot.weekday < 0 || slot.weekday > 6) errors.push('weekday');
    if (!slot.start_time || !slot.end_time) errors.push('slot_time');
  }
  return [...new Set(errors)];
}

export function scheduleLabelFromGroupSlots(slots: SchoolClassGroupSlot[]): string {
  const days = ['sekmadienis', 'pirmadienis', 'antradienis', 'trečiadienis', 'ketvirtadienis', 'penktadienis', 'šeštadienis'];
  return [...slots]
    .sort((a, b) => a.weekday - b.weekday || String(a.start_time).localeCompare(String(b.start_time)))
    .map((s) => {
      const start = String(s.start_time || '').slice(0, 5);
      const end = String(s.end_time || '').slice(0, 5);
      return `${days[s.weekday] || s.weekday} ${start}–${end}`;
    })
    .join(', ');
}

export function parseClassGroupWriteBody(
  body: Record<string, unknown>,
  fallbackTutorId: string,
): SchoolClassGroupWrite {
  const duration = Number(body.duration_minutes || 45);
  const rawSlots = Array.isArray(body.slots) ? body.slots as Array<{ weekday: number; start_time: string; end_time?: string | null }> : [];
  return {
    name: String(body.name || '').trim(),
    tutor_id: String(body.tutor_id || fallbackTutorId || '').trim(),
    subject_id: body.subject_id ? String(body.subject_id) : null,
    school_year_start: String(body.school_year_start || '').slice(0, 10),
    school_year_end: String(body.school_year_end || '').slice(0, 10),
    platform: String(body.platform || 'Google Meet').trim() || 'Google Meet',
    duration_minutes: Number.isFinite(duration) && duration > 0 ? duration : 45,
    meeting_link: body.meeting_link == null || String(body.meeting_link).trim() === ''
      ? null
      : String(body.meeting_link).trim(),
    slots: normalizeGroupSlots(rawSlots, duration),
    student_ids: Array.isArray(body.student_ids) ? [...new Set(body.student_ids.map(String))] : null,
  };
}

export function classGroupRowFields(draft: SchoolClassGroupDraft): Record<string, unknown> {
  return {
    tutor_id: draft.tutor_id,
    subject_id: draft.subject_id ?? null,
    name: draft.name,
    school_year_start: draft.school_year_start,
    school_year_end: draft.school_year_end,
    platform: draft.platform || 'Google Meet',
    duration_minutes: draft.duration_minutes || 45,
    meeting_link: draft.meeting_link ?? null,
  };
}

export function groupToWriteDraft(group: SchoolClassGroupRecord): SchoolClassGroupWrite {
  const duration = group.duration_minutes || 45;
  return {
    name: group.name,
    tutor_id: group.tutor_id,
    subject_id: group.subject_id ?? null,
    school_year_start: String(group.school_year_start || '').slice(0, 10),
    school_year_end: String(group.school_year_end || '').slice(0, 10),
    platform: group.platform || 'Google Meet',
    duration_minutes: duration,
    meeting_link: group.meeting_link ?? null,
    slots: normalizeGroupSlots(group.slots || [], duration),
    student_ids: (group.members || []).map((member) => member.student_id),
  };
}

export function toggleMemberIds(current: string[], studentId: string): string[] {
  const set = new Set(current);
  if (set.has(studentId)) set.delete(studentId);
  else set.add(studentId);
  return [...set];
}

export function studentsForGroupPicker<T extends { id: string; enrollment_status?: string | null }>(
  students: T[],
  selectedIds: string[],
): T[] {
  const selected = new Set(selectedIds);
  return students.filter((student) => selected.has(student.id) || !isArchivedEnrollmentStatus(student.enrollment_status));
}
