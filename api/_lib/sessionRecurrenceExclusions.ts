import type { SupabaseClient } from '@supabase/supabase-js';

export type SessionRecurrenceExclusion = {
  recurring_session_id: string | null;
  class_group_id: string | null;
  /** null excludes the whole group; a family exclusion always has its child's id. */
  student_id: string | null;
  scope: 'single' | 'future' | 'all';
  start_time: string | null;
};

export async function loadSessionRecurrenceExclusions(
  supabase: SupabaseClient,
  series: { recurringSessionId: string } | { classGroupId: string },
): Promise<SessionRecurrenceExclusion[]> {
  const exclusions: SessionRecurrenceExclusion[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = supabase.from('session_recurrence_exclusions')
      .select('recurring_session_id, class_group_id, student_id, scope, start_time');
    query = 'classGroupId' in series ? query.eq('class_group_id', series.classGroupId)
      : query.eq('recurring_session_id', series.recurringSessionId);
    const { data, error } = await query.order('id', { ascending: true }).range(offset, offset + 499);
    // Safe before the migration: deletion itself requires the new atomic RPC, so
    // no exclusions can yet exist. Other failures must stop materialization.
    if (error?.code === '42P01' || error?.code === 'PGRST205') return [];
    if (error) throw new Error(`Failed to load deleted recurring occurrences: ${error.message}`);
    exclusions.push(...((data || []) as SessionRecurrenceExclusion[]));
    if (!data || data.length < 500) return exclusions;
  }
}

export function isSessionOccurrenceExcluded(
  exclusions: SessionRecurrenceExclusion[],
  studentId: string,
  startTime: string,
): boolean {
  const startMs = Date.parse(startTime);
  return exclusions.some((exclusion) => {
    if (exclusion.student_id && exclusion.student_id !== studentId) return false;
    if (exclusion.scope === 'all') return true;
    const excludedMs = Date.parse(exclusion.start_time || '');
    return Number.isFinite(startMs) && Number.isFinite(excludedMs)
      && (exclusion.scope === 'future' ? startMs >= excludedMs : startMs === excludedMs);
  });
}
