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
  return slots
    .map((s) => `${days[s.weekday] || s.weekday} ${s.start_time}–${s.end_time}`)
    .join(', ');
}
