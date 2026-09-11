import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveSessionMeetingLink } from '../../src/lib/meetingLink.js';

type SessionLinkSource = {
  meeting_link?: string | null;
  tutor_id?: string | null;
  student_id?: string | null;
  subject_id?: string | null;
};

/** Resolve join URL for one session, fetching tutor/student/subject fallbacks when needed. */
export async function resolveSessionMeetingLinkFromDb(
  supabase: SupabaseClient,
  session: SessionLinkSource,
): Promise<string> {
  const stored = (session.meeting_link || '').trim();
  if (stored) return stored;

  const [tutorRes, studentRes, subjectRes] = await Promise.all([
    session.tutor_id
      ? supabase.from('profiles').select('personal_meeting_link').eq('id', session.tutor_id).maybeSingle()
      : Promise.resolve({ data: null }),
    session.student_id
      ? supabase.from('students').select('personal_meeting_link').eq('id', session.student_id).maybeSingle()
      : Promise.resolve({ data: null }),
    session.subject_id
      ? supabase.from('subjects').select('meeting_link').eq('id', session.subject_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return resolveSessionMeetingLink({
    sessionLink: session.meeting_link,
    tutorPersonalLink: (tutorRes.data as { personal_meeting_link?: string | null } | null)?.personal_meeting_link,
    studentPersonalLink: (studentRes.data as { personal_meeting_link?: string | null } | null)?.personal_meeting_link,
    subjectLink: (subjectRes.data as { meeting_link?: string | null } | null)?.meeting_link,
  });
}

/** Batch-load fallbacks for recurring materializer (many templates share tutor/student/subject). */
export async function buildMeetingLinkFallbackMaps(
  supabase: SupabaseClient,
  templates: Array<{ tutor_id: string; student_id: string; subject_id: string | null }>,
): Promise<{
  tutorLinks: Map<string, string>;
  studentLinks: Map<string, string>;
  subjectLinks: Map<string, string>;
}> {
  const tutorIds = [...new Set(templates.map((t) => t.tutor_id))];
  const studentIds = [...new Set(templates.map((t) => t.student_id))];
  const subjectIds = [...new Set(templates.map((t) => t.subject_id).filter(Boolean))] as string[];

  const [tutorRows, studentRows, subjectRows] = await Promise.all([
    tutorIds.length
      ? supabase.from('profiles').select('id, personal_meeting_link').in('id', tutorIds)
      : Promise.resolve({ data: [] as Array<{ id: string; personal_meeting_link?: string | null }> }),
    studentIds.length
      ? supabase.from('students').select('id, personal_meeting_link').in('id', studentIds)
      : Promise.resolve({ data: [] as Array<{ id: string; personal_meeting_link?: string | null }> }),
    subjectIds.length
      ? supabase.from('subjects').select('id, meeting_link').in('id', subjectIds)
      : Promise.resolve({ data: [] as Array<{ id: string; meeting_link?: string | null }> }),
  ]);

  const tutorLinks = new Map<string, string>();
  for (const row of tutorRows.data || []) {
    const link = String(row.personal_meeting_link || '').trim();
    if (link) tutorLinks.set(row.id, link);
  }
  const studentLinks = new Map<string, string>();
  for (const row of studentRows.data || []) {
    const link = String(row.personal_meeting_link || '').trim();
    if (link) studentLinks.set(row.id, link);
  }
  const subjectLinks = new Map<string, string>();
  for (const row of subjectRows.data || []) {
    const link = String(row.meeting_link || '').trim();
    if (link) subjectLinks.set(row.id, link);
  }
  return { tutorLinks, studentLinks, subjectLinks };
}

export function resolveTemplateMeetingLink(
  template: { meeting_link?: string | null; tutor_id: string; student_id: string; subject_id: string | null },
  maps: {
    tutorLinks: Map<string, string>;
    studentLinks: Map<string, string>;
    subjectLinks: Map<string, string>;
  },
): string | null {
  const resolved = resolveSessionMeetingLink({
    sessionLink: template.meeting_link,
    tutorPersonalLink: maps.tutorLinks.get(template.tutor_id),
    studentPersonalLink: maps.studentLinks.get(template.student_id),
    subjectLink: template.subject_id ? maps.subjectLinks.get(template.subject_id) : undefined,
  });
  return resolved || null;
}
