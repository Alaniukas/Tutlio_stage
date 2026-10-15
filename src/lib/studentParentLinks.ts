import type { SupabaseClient } from '@supabase/supabase-js';

/** Preserve both parent link representations before returning or moving a tutor assignment. */
export async function copyStudentParentLinksForTutorPairing(
  supabase: SupabaseClient,
  sourceStudentId: string,
  targetStudentId: string,
): Promise<void> {
  const { error } = await supabase.rpc('copy_student_parent_links_for_tutor_pairing', {
    p_source_student_id: sourceStudentId,
    p_target_student_id: targetStudentId,
  });
  if (error) throw new Error(error.message || 'Failed to preserve student parent accounts.');
}
