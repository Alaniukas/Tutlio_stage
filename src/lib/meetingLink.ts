/**
 * Lesson join link priority for org tutors: tutor personal link overrides subject default.
 * Student-specific link still wins when explicitly set on the student record.
 */
export function resolveLessonMeetingLink(opts: {
  subjectLink?: string | null;
  tutorPersonalLink?: string | null;
  studentPersonalLink?: string | null;
}): string {
  const student = (opts.studentPersonalLink || '').trim();
  if (student) return student;
  const tutor = (opts.tutorPersonalLink || '').trim();
  if (tutor) return tutor;
  return (opts.subjectLink || '').trim();
}
