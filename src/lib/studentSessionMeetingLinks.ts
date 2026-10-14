import type { SupabaseClient } from '@supabase/supabase-js';
import {
  enrichSessionMeetingLink,
  normalizeMeetingLinkValue,
  type SessionMeetingLinkContext,
  type SessionMeetingLinkRow,
} from './meetingLink';

type LoadedMeetingLinks = Pick<SessionMeetingLinkContext, 'studentsById' | 'tutorsById' | 'subjectsById'>;

/**
 * Shared by student/parent dashboards and lesson lists. Resolve each lesson
 * using its own student and tutor, rather than the portal's selected profile.
 * Existing session links win; only missing fallback rows need authenticated reads.
 */
export async function loadStudentSessionMeetingLinks<T extends SessionMeetingLinkRow>(
  client: SupabaseClient,
  sessions: T[],
  loaded: LoadedMeetingLinks = {},
): Promise<T[]> {
  const pending = sessions.filter((row) => !normalizeMeetingLinkValue(row.meeting_link));
  if (pending.length === 0) return sessions;

  const studentsById = new Map(loaded.studentsById);
  const tutorsById = new Map(loaded.tutorsById);
  const subjectsById = new Map(loaded.subjectsById);
  const missingIds = (key: 'student_id' | 'tutor_id' | 'subject_id', known: ReadonlyMap<string, unknown>) =>
    [...new Set(pending.map((row) => row[key]).filter((id): id is string => !!id && !known.has(id)))];
  const studentIds = missingIds('student_id', studentsById);
  const tutorIds = missingIds('tutor_id', tutorsById);
  const subjectIds = missingIds('subject_id', subjectsById);

  const [students, tutors, subjects] = await Promise.all([
    studentIds.length
      ? client.from('students').select('id, personal_meeting_link').in('id', studentIds)
      : Promise.resolve({ data: [], error: null }),
    tutorIds.length
      ? client.from('profiles').select('id, personal_meeting_link').in('id', tutorIds)
      : Promise.resolve({ data: [], error: null }),
    subjectIds.length
      ? client.from('subjects').select('id, meeting_link').in('id', subjectIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  for (const [source, result] of [['students', students], ['profiles', tutors], ['subjects', subjects]] as const) {
    if (result.error) {
      console.warn('[studentSessionMeetingLinks]', source, result.error.code, result.error.message);
    }
  }
  for (const row of students.data ?? []) studentsById.set(row.id, row);
  for (const row of tutors.data ?? []) tutorsById.set(row.id, row);
  for (const row of subjects.data ?? []) subjectsById.set(row.id, row);

  return sessions.map((row) => enrichSessionMeetingLink(row, { studentsById, tutorsById, subjectsById }));
}
