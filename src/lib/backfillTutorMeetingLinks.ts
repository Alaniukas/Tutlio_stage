import type { SupabaseClient } from '@supabase/supabase-js';

/** Copy tutor personal link onto future sessions/templates that never got a snapshot. */
export async function backfillTutorMeetingLinks(
  supabase: SupabaseClient,
  tutorId: string,
  meetingLink: string | null,
): Promise<void> {
  const link = (meetingLink || '').trim();
  if (!link) return;
  const nowIso = new Date().toISOString();
  await Promise.all([
    supabase
      .from('sessions')
      .update({ meeting_link: link })
      .eq('tutor_id', tutorId)
      .eq('status', 'active')
      .gte('start_time', nowIso)
      .is('meeting_link', null),
    supabase
      .from('recurring_individual_sessions')
      .update({ meeting_link: link })
      .eq('tutor_id', tutorId)
      .eq('active', true)
      .is('meeting_link', null),
  ]);
}
