import { supabase } from '@/lib/supabase';

export type StudentNotesDraft = {
  admin_comment: string;
  last_contacted_at: string;
  tutor_comment: string;
};

export type StudentAdminNotes = {
  student_id: string;
  admin_comment: string | null;
  last_contacted_at: string | null;
};

export async function loadStudentAdminNotes(studentId: string, studentIds: string[] = [studentId]): Promise<StudentAdminNotes | null> {
  const { data, error } = await supabase
    .from('student_admin_notes')
    .select('student_id, admin_comment, last_contacted_at')
    .in('student_id', [...new Set(studentIds)]);
  if (error) throw error;
  const rows = (data || []) as StudentAdminNotes[];
  if (rows.length === 0) return null;
  // Historical tutor pairings may contain different notes. Present all of them
  // before saving a unified child card so a blank primary row never erases them.
  return {
    student_id: studentId,
    admin_comment: [...new Set(rows.map((row) => row.admin_comment?.trim()).filter(Boolean))].join('\n\n') || null,
    last_contacted_at: rows.map((row) => row.last_contacted_at).filter((date): date is string => Boolean(date)).sort().at(-1) || null,
  };
}

/** The RPC checks every pairing and saves private and shared fields atomically. */
export async function saveStudentNotes(studentIds: string[], draft: StudentNotesDraft): Promise<void> {
  const { error } = await supabase.rpc('save_student_notes', {
    p_student_ids: [...new Set(studentIds)],
    p_admin_comment: draft.admin_comment.trim() || null,
    p_last_contacted_at: draft.last_contacted_at || null,
    p_tutor_comment: draft.tutor_comment.trim() || null,
  });
  if (error) throw error;
}
