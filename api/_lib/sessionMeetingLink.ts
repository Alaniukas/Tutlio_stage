import type { SupabaseClient } from '@supabase/supabase-js';

export function normalizeLessonMeetingLink(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const input = value.trim();
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

/** Same fallback in reminders and the tracked redirect, so the button cannot disagree. */
export async function resolveSessionMeetingLink(db: SupabaseClient, session: {
  meeting_link?: string | null; subject_id?: string | null; tutor_id?: string | null;
}): Promise<string | null> {
  const direct = normalizeLessonMeetingLink(session.meeting_link);
  if (direct) return direct;
  if (session.subject_id && session.tutor_id) {
    const { data, error } = await db.from('subjects').select('meeting_link')
      .eq('id', session.subject_id).eq('tutor_id', session.tutor_id).maybeSingle();
    if (error) throw error;
    const link = normalizeLessonMeetingLink(data?.meeting_link);
    if (link) return link;
  }
  if (session.tutor_id) {
    const { data, error } = await db.from('profiles').select('personal_meeting_link').eq('id', session.tutor_id).maybeSingle();
    if (error) throw error;
    return normalizeLessonMeetingLink(data?.personal_meeting_link);
  }
  return null;
}
