export type SchoolConsultationTarget = 'child' | 'family';

export type SchoolFamilyConsultationBooking = {
  id: string;
  organization_id: string;
  student_id: string;
  tutor_id?: string | null;
  kind: 'teacher_subject' | 'help_team';
  target_kind?: SchoolConsultationTarget;
  family_student_ids?: string[];
  help_team_category?: string | null;
  request_id?: string | null;
  status: string;
  start_time?: string | null;
  end_time?: string | null;
  planned_minutes?: number | null;
  school_year: string;
  canReadNotes?: boolean;
  canWriteNotes?: boolean;
  [key: string]: unknown;
};

export function schoolFamilyConsultationVisibleToParent(
  booking: SchoolFamilyConsultationBooking,
  eligibleStudentIds: readonly string[],
): boolean {
  return booking.target_kind === 'family'
    ? (booking.family_student_ids || []).some(id => eligibleStudentIds.includes(id))
    : eligibleStudentIds.includes(booking.student_id);
}

/** The overview includes both targets; a selected child's view includes that child only. */
export function schoolFamilyConsultationsForView<T extends SchoolFamilyConsultationBooking>(
  bookings: T[], selectedStudentId?: string | null,
): T[] {
  return selectedStudentId
    ? bookings.filter(row => row.target_kind !== 'family' && row.student_id === selectedStudentId)
    : bookings;
}
