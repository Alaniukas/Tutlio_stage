/**
 * Lesson join link priority for org tutors: tutor personal link overrides subject default.
 * Student-specific link still wins when explicitly set on the student record.
 */
export function normalizeMeetingLinkValue(value: string | null | undefined): string | null {
  const trimmed = String(value || '').trim();
  return trimmed || null;
}

/** Compare the requested value with the row returned by PostgREST after update. */
export function meetingLinkWasPersisted(
  requested: string | null | undefined,
  persisted: string | null | undefined,
): boolean {
  return normalizeMeetingLinkValue(requested) === normalizeMeetingLinkValue(persisted);
}

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

/** Stored session link wins; otherwise fall back to student → tutor → subject chain. */
export function resolveSessionMeetingLink(opts: {
  sessionLink?: string | null;
  subjectLink?: string | null;
  tutorPersonalLink?: string | null;
  studentPersonalLink?: string | null;
}): string {
  const stored = (opts.sessionLink || '').trim();
  if (stored) return stored;
  return resolveLessonMeetingLink({
    subjectLink: opts.subjectLink,
    tutorPersonalLink: opts.tutorPersonalLink,
    studentPersonalLink: opts.studentPersonalLink,
  });
}

type SessionMeetingLinkRow = {
  meeting_link?: string | null;
  student_id?: string | null;
  subject_id?: string | null;
};

/** Enrich session rows for display / join when `sessions.meeting_link` was never snapshotted. */
export function enrichSessionMeetingLink<T extends SessionMeetingLinkRow>(
  session: T,
  ctx: {
    tutorPersonalLink?: string | null;
    studentsById?: ReadonlyMap<string, { personal_meeting_link?: string | null }>;
    subjectsById?: ReadonlyMap<string, { meeting_link?: string | null }>;
    studentPersonalLink?: string | null;
    subjectLink?: string | null;
  },
): T {
  const studentLink =
    ctx.studentPersonalLink ??
    (session.student_id ? ctx.studentsById?.get(session.student_id)?.personal_meeting_link : undefined);
  const subjectLink =
    ctx.subjectLink ??
    (session.subject_id ? ctx.subjectsById?.get(session.subject_id)?.meeting_link : undefined);
  const resolved = resolveSessionMeetingLink({
    sessionLink: session.meeting_link,
    tutorPersonalLink: ctx.tutorPersonalLink,
    studentPersonalLink: studentLink,
    subjectLink,
  });
  if (!resolved || resolved === (session.meeting_link || '').trim()) return session;
  return { ...session, meeting_link: resolved };
}
