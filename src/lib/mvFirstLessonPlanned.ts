import type { SupabaseClient } from '@supabase/supabase-js';

/** Non-cancelled sessions count toward prior history for the student+tutor pair. */
export function isFirstLessonForStudentTutorPair(
  totalNonCancelledCount: number,
  sessionsJustCreatedForPair: number,
): boolean {
  if (sessionsJustCreatedForPair <= 0) return false;
  return totalNonCancelledCount === sessionsJustCreatedForPair;
}

export async function countNonCancelledSessionsForPair(
  supabase: SupabaseClient,
  studentId: string,
  tutorId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .eq('tutor_id', tutorId)
    .neq('status', 'cancelled');
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** After insert: true when every non-cancelled session for the pair came from this booking batch. */
export async function isFirstLessonAfterCreate(
  supabase: SupabaseClient,
  studentId: string,
  tutorId: string,
  sessionsJustCreatedForPair = 1,
): Promise<boolean> {
  const total = await countNonCancelledSessionsForPair(supabase, studentId, tutorId);
  return isFirstLessonForStudentTutorPair(total, sessionsJustCreatedForPair);
}
