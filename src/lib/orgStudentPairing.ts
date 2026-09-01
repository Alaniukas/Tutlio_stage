import type { SupabaseClient } from '@supabase/supabase-js';
import { reassignOpenLessonsToTutor } from '@/lib/reassignStudentTutorLessons';

export const generateStudentInviteCode = () =>
  Math.random().toString(36).substring(2, 8).toUpperCase();

type StudentPairingRow = {
  id: string;
  tutor_id: string | null;
  linked_user_id: string | null;
  organization_id: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  grade: string | null;
  payer_name: string | null;
  payer_email: string | null;
  payer_phone: string | null;
  child_birth_date: string | null;
  payment_model: string | null;
  preferred_availability: unknown;
};

const PAIRING_SELECT =
  'id, tutor_id, linked_user_id, organization_id, full_name, email, phone, grade, payer_name, payer_email, payer_phone, child_birth_date, payment_model, preferred_availability';

/**
 * Guarantees a students row pairing this student identity with the given
 * tutor, so booking a lesson with any org tutor auto-assigns them on the
 * students page. Mirrors the manual "add tutor" flow in CompanyStudents:
 * reuse an existing sibling pairing, claim a tutorless row, or insert a
 * duplicate row copying the identity fields with a fresh invite code.
 *
 * Returns the students.id to use as session.student_id for (identity, tutor).
 */
export async function ensureStudentPairedWithTutor(
  supabase: SupabaseClient,
  studentRowId: string,
  tutorId: string,
): Promise<string> {
  const { data: row, error } = await supabase
    .from('students')
    .select(PAIRING_SELECT)
    .eq('id', studentRowId)
    .maybeSingle();
  if (error || !row) return studentRowId;
  const student = row as StudentPairingRow;

  if (student.tutor_id === tutorId) return studentRowId;

  let siblings: StudentPairingRow[] = [student];
  if (student.linked_user_id) {
    const { data: siblingRows } = await supabase
      .from('students')
      .select(PAIRING_SELECT)
      .eq('linked_user_id', student.linked_user_id);
    if (siblingRows?.length) siblings = siblingRows as StudentPairingRow[];
  }

  const existingPairing = siblings.find((s) => s.tutor_id === tutorId);
  if (existingPairing) return existingPairing.id;

  const tutorlessRow = siblings.find((s) => !s.tutor_id);
  if (tutorlessRow) {
    const { error: claimErr } = await supabase
      .from('students')
      .update({ tutor_id: tutorId })
      .eq('id', tutorlessRow.id);
    if (!claimErr) {
      await reassignOpenLessonsToTutor(supabase, tutorlessRow.id, {
        studentId: tutorlessRow.id,
        tutorId,
      });
      return tutorlessRow.id;
    }
  }

  const { data: created, error: insertErr } = await supabase
    .from('students')
    .insert({
      tutor_id: tutorId,
      organization_id: student.organization_id,
      full_name: student.full_name,
      email: student.email,
      phone: (student.phone || '').trim() || null,
      grade: student.grade,
      payer_name: student.payer_name || null,
      payer_email: student.payer_email || null,
      payer_phone: student.payer_phone || null,
      child_birth_date: student.child_birth_date || null,
      payment_model: student.payment_model || null,
      preferred_availability: student.preferred_availability ?? null,
      linked_user_id: student.linked_user_id || null,
      invite_code: generateStudentInviteCode(),
    })
    .select('id')
    .single();
  if (insertErr || !created) {
    throw new Error(insertErr?.message || 'Failed to pair the student with the tutor.');
  }
  return (created as { id: string }).id;
}
