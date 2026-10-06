import type { SupabaseClient } from '@supabase/supabase-js';
import {
  normalizeOrgStudentIdentityName,
  sameOrgStudentIdentity,
  sameOrgStudentRegisteredContact,
} from '@/lib/orgStudentIdentity.js';
import { reassignOpenLessonsToTutor } from '@/lib/reassignStudentTutorLessons.js';

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
  admin_comment?: string | null;
  admin_comment_visible_to_tutor?: boolean | null;
};

const PAIRING_SELECT =
  'id, tutor_id, linked_user_id, organization_id, full_name, email, phone, grade, payer_name, payer_email, payer_phone, child_birth_date, payment_model, preferred_availability, admin_comment, admin_comment_visible_to_tutor';

function mergePairingRows(primary: StudentPairingRow, rows: StudentPairingRow[]): StudentPairingRow[] {
  const byId = new Map<string, StudentPairingRow>();
  byId.set(primary.id, primary);
  for (const row of rows) {
    if (row.id !== primary.id) byId.set(row.id, row);
  }
  return [...byId.values()];
}

async function loadOrgStudentIdentitySiblings(
  supabase: SupabaseClient,
  student: StudentPairingRow,
): Promise<StudentPairingRow[]> {
  const orgId = student.organization_id;
  const name = normalizeOrgStudentIdentityName(student.full_name);
  if (!orgId || !name) return [];

  const byId = new Map<string, StudentPairingRow>();
  const addRows = (rows: StudentPairingRow[]) => {
    for (const row of rows) {
      if (row.id === student.id) continue;
      if (!sameOrgStudentIdentity(student, row)) continue;
      byId.set(row.id, row);
    }
  };

  const payerEmail = String(student.payer_email ?? '').trim();
  if (payerEmail) {
    const { data, error } = await supabase
      .from('students')
      .select(PAIRING_SELECT)
      .eq('organization_id', orgId)
      .eq('payer_email', payerEmail);
    if (error) throw new Error(error.message || 'Failed to load student tutor pairings.');
    addRows((data || []) as StudentPairingRow[]);
  }

  const studentEmail = String(student.email ?? '').trim().toLowerCase();
  if (studentEmail) {
    const { data, error } = await supabase
      .from('students')
      .select(PAIRING_SELECT)
      .eq('organization_id', orgId)
      .ilike('email', studentEmail);
    if (error) throw new Error(error.message || 'Failed to load student tutor pairings.');
    addRows((data || []) as StudentPairingRow[]);
  }

  return [...byId.values()];
}

async function findExistingTutorPairingByContact(
  supabase: SupabaseClient,
  student: StudentPairingRow,
  tutorId: string,
): Promise<StudentPairingRow | null> {
  const orgId = student.organization_id;
  const studentEmail = String(student.email ?? '').trim().toLowerCase();
  const name = normalizeOrgStudentIdentityName(student.full_name);
  if (!orgId || !studentEmail || !name) return null;

  const { data, error } = await supabase
    .from('students')
    .select(PAIRING_SELECT)
    .eq('organization_id', orgId)
    .eq('tutor_id', tutorId)
    .ilike('email', studentEmail);
  if (error) throw new Error(error.message || 'Failed to load student tutor pairings.');

  return ((data || []) as StudentPairingRow[]).find((row) =>
    sameOrgStudentRegisteredContact(student, row),
  ) ?? null;
}

function pickPayerFieldsFromSiblings(
  siblings: StudentPairingRow[],
  fallback: StudentPairingRow,
): Pick<StudentPairingRow, 'payer_name' | 'payer_email' | 'payer_phone'> {
  const donor = siblings.find((row) => String(row.payer_email ?? '').trim()) ?? fallback;
  return {
    payer_name: donor.payer_name || null,
    payer_email: donor.payer_email || null,
    payer_phone: donor.payer_phone || null,
  };
}

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

  const identitySiblings = await loadOrgStudentIdentitySiblings(supabase, student);
  let siblings = mergePairingRows(student, identitySiblings);
  if (student.linked_user_id) {
    const { data: siblingRows, error: siblingsError } = await supabase
      .from('students')
      .select(PAIRING_SELECT)
      .eq('linked_user_id', student.linked_user_id);
    if (siblingsError) throw new Error(siblingsError.message || 'Failed to load student tutor pairings.');
    const sameChild = (siblingRows || []).filter((row) =>
      row.linked_user_id === student.linked_user_id
      && row.organization_id === student.organization_id
      && sameOrgStudentIdentity(student, row as StudentPairingRow),
    ) as StudentPairingRow[];
    siblings = mergePairingRows(student, [...identitySiblings, ...sameChild]);
  }

  const { data: privateNotes, error: notesError } = await supabase
    .from('student_admin_notes')
    .select('student_id, admin_comment, last_contacted_at')
    .in('student_id', siblings.map((candidate) => candidate.id));
  if (notesError) throw new Error(notesError.message || 'Failed to load student administration notes.');
  const sourceNotes = (privateNotes || []) as Array<{
    student_id: string;
    admin_comment: string | null;
    last_contacted_at: string | null;
  }>;
  const tutorComment = [...new Set(siblings
    .filter((candidate) => candidate.admin_comment_visible_to_tutor === true)
    .map((candidate) => String(candidate.admin_comment || '').trim()).filter(Boolean))].join('\n\n') || null;
  const privateComment = [...new Set(sourceNotes
    .map((note) => String(note.admin_comment || '').trim()).filter(Boolean))].join('\n\n') || null;
  const lastContactedAt = sourceNotes.map((note) => note.last_contacted_at)
    .filter((date): date is string => Boolean(date)).sort().at(-1) || null;

  const copyNotes = async (target: StudentPairingRow) => {
    const allPairings = [...siblings.filter((candidate) => candidate.id !== target.id), target];
    const commentsMatch = allPairings.every((candidate) => tutorComment === (
      candidate.admin_comment_visible_to_tutor ? String(candidate.admin_comment || '').trim() || null : null
    ));
    if (sourceNotes.length === 0 && commentsMatch) return;
    const { error: copyError } = await supabase.rpc('save_student_notes', {
      // Unify verified pairings as the student card does. Otherwise a later
      // assignment would merge Alpha + Beta + an earlier merged Alpha/Beta.
      p_student_ids: [...new Set([...siblings.map((candidate) => candidate.id), target.id])],
      p_admin_comment: privateComment,
      p_last_contacted_at: lastContactedAt,
      p_tutor_comment: tutorComment,
    });
    if (copyError) throw new Error(copyError.message || 'Failed to copy student administration notes.');
  };

  const existingPairing = siblings.find((s) => s.tutor_id === tutorId)
    ?? await findExistingTutorPairingByContact(supabase, student, tutorId);
  if (existingPairing) {
    const payerFields = pickPayerFieldsFromSiblings(siblings, student);
    if (!String(existingPairing.payer_email ?? '').trim() && payerFields.payer_email) {
      const { error: payerErr } = await supabase
        .from('students')
        .update(payerFields)
        .eq('id', existingPairing.id);
      if (payerErr) throw new Error(payerErr.message || 'Failed to copy payer contact onto student row.');
    }
    await copyNotes(existingPairing);
    return existingPairing.id;
  }

  const tutorlessRow = siblings.find((s) => !s.tutor_id);
  if (tutorlessRow) {
    // Save first: a note/RPC error must leave a legacy tutorless row unclaimed,
    // rather than returning a new assignment with missing tutor instructions.
    await copyNotes(tutorlessRow);
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

  const payerFields = pickPayerFieldsFromSiblings(siblings, student);

  const { data: created, error: insertErr } = await supabase
    .from('students')
    .insert({
      tutor_id: tutorId,
      organization_id: student.organization_id,
      full_name: student.full_name,
      email: student.email,
      phone: (student.phone || '').trim() || null,
      grade: student.grade,
      payer_name: payerFields.payer_name,
      payer_email: payerFields.payer_email,
      payer_phone: payerFields.payer_phone,
      child_birth_date: student.child_birth_date || null,
      payment_model: student.payment_model || null,
      preferred_availability: student.preferred_availability ?? null,
      linked_user_id: student.linked_user_id || null,
      invite_code: generateStudentInviteCode(),
      admin_comment: tutorComment,
      admin_comment_visible_to_tutor: true,
    })
    .select('id')
    .single();
  if (insertErr || !created) {
    throw new Error(insertErr?.message || 'Failed to pair the student with the tutor.');
  }
  const createdId = (created as { id: string }).id;
  {
    try {
      await copyNotes({ ...student, id: createdId, admin_comment: tutorComment, admin_comment_visible_to_tutor: true });
    } catch (copyError) {
      // No lessons reference the new pairing yet. Undo it if copying the
      // administration record fails, so retrying cannot silently lose notes.
      await supabase.from('students').delete().eq('id', createdId);
      throw copyError;
    }
  }
  return createdId;
}
