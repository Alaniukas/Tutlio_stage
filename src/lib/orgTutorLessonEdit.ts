/**
 * Org permissions – what an org tutor is allowed to change in Lesson Settings.
 * JSON: organizations.org_tutor_lesson_edit
 * Sena forma: subjects_pricing, registration – suderinama su parseOrgLessonEditScope.
 */
export type OrgLessonEditScope = {
  subjects: boolean;
  pricing: boolean;
  cancellation: boolean;
  break_between_lessons: boolean;
  min_booking_hours: boolean;
  reminders: boolean;
};

export const EMPTY_ORG_LESSON_SCOPE: OrgLessonEditScope = {
  subjects: false,
  pricing: false,
  cancellation: false,
  break_between_lessons: false,
  min_booking_hours: false,
  reminders: false,
};

export function parseOrgLessonEditScope(
  raw: Record<string, unknown> | null | undefined,
  legacy: boolean
): OrgLessonEditScope {
  const sp = raw?.subjects_pricing === true || legacy;
  const reg = raw?.registration === true || legacy;

  return {
    subjects: typeof raw?.subjects === 'boolean' ? (raw.subjects as boolean) : sp,
    pricing: typeof raw?.pricing === 'boolean' ? (raw.pricing as boolean) : sp,
    cancellation: typeof raw?.cancellation === 'boolean' ? (raw.cancellation as boolean) : legacy,
    break_between_lessons:
      typeof raw?.break_between_lessons === 'boolean'
        ? (raw.break_between_lessons as boolean)
        : reg,
    min_booking_hours:
      typeof raw?.min_booking_hours === 'boolean'
        ? (raw.min_booking_hours as boolean)
        : reg,
    reminders: typeof raw?.reminders === 'boolean' ? (raw.reminders as boolean) : legacy,
  };
}

export function anyOrgLessonEdit(s: OrgLessonEditScope): boolean {
  return (
    s.subjects ||
    s.pricing ||
    s.cancellation ||
    s.break_between_lessons ||
    s.min_booking_hours ||
    s.reminders
  );
}
