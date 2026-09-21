import { supabase } from '@/lib/supabase';
import { isProKlaseOrg } from '@/lib/marketMoney';

export type StudentTrialHistoryRow = {
  id: string;
  student_id: string;
  start_time?: string | null;
  status?: string | null;
};

/** Read the trial order shown to a tutor. Pro Klasė needs a scoped RPC because
 * regular session RLS hides the same student's lessons with other tutors. */
export async function fetchStudentTrialHistory(
  studentIds: string[],
  tutorId: string,
  organizationId: string | null | undefined,
): Promise<StudentTrialHistoryRow[]> {
  const ids = [...new Set(studentIds.filter(Boolean))];
  if (!ids.length) return [];

  const result = isProKlaseOrg(organizationId)
    ? await supabase.rpc('proklase_tutor_trial_history', { p_student_ids: ids })
    : await supabase
        .from('sessions')
        .select('id, student_id, start_time, status, subjects!inner(is_trial)')
        .in('student_id', ids)
        .eq('tutor_id', tutorId)
        .eq('subjects.is_trial', true)
        .order('start_time', { ascending: true });
  if (result.error) throw result.error;
  return (result.data || []) as StudentTrialHistoryRow[];
}
