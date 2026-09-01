import type { SupabaseClient } from '@supabase/supabase-js';

/** Upcoming / held lessons — history (completed, cancelled, no_show) stays with the old tutor. */
export const OPEN_LESSON_SESSION_STATUSES = ['active'] as const;

export type PairingRef = { id: string; tutor_id: string | null };

/**
 * When removing one pairing from a multi-tutor student, move open lessons only if
 * exactly one remaining pairing has a tutor (typical "switch Ieva → Rimantas").
 */
export function targetPairingForRemovedRow(remainingGroup: PairingRef[]): { id: string; tutorId: string } | null {
  const withTutor = remainingGroup.filter((r): r is PairingRef & { tutor_id: string } => Boolean(r.tutor_id));
  if (withTutor.length !== 1) return null;
  return { id: withTutor[0].id, tutorId: withTutor[0].tutor_id };
}

/** Hard-delete a pairing row only when another pairing remains and nothing is left on this row. */
export function canHardDeleteStudentPairing(remainingGroupSize: number, leftoverLessonRows: number): boolean {
  return remainingGroupSize >= 1 && leftoverLessonRows === 0;
}

export async function reassignOpenLessonsToTutor(
  supabase: SupabaseClient,
  fromStudentId: string,
  to: { studentId: string; tutorId: string },
): Promise<{ movedSessions: number; movedPackages: number }> {
  const { data: sessions, error: sessErr } = await supabase
    .from('sessions')
    .select('id, lesson_package_id')
    .eq('student_id', fromStudentId)
    .in('status', [...OPEN_LESSON_SESSION_STATUSES]);
  if (sessErr) throw new Error(sessErr.message);

  const sessionIds = (sessions ?? []).map((s) => s.id as string);
  const packageIds = [
    ...new Set(
      (sessions ?? [])
        .map((s) => s.lesson_package_id as string | null)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  if (sessionIds.length > 0) {
    const patch: { tutor_id: string; student_id?: string } = { tutor_id: to.tutorId };
    if (to.studentId !== fromStudentId) patch.student_id = to.studentId;
    const { error } = await supabase.from('sessions').update(patch).in('id', sessionIds);
    if (error) throw new Error(error.message);
  }

  let extraPkgIds: string[] = [];
  if (to.studentId !== fromStudentId) {
    const { data: openPkgs, error: pkgErr } = await supabase
      .from('lesson_packages')
      .select('id')
      .eq('student_id', fromStudentId)
      .is('cancelled_at', null)
      .or('reserved_lessons.gt.0,available_lessons.gt.0');
    if (pkgErr) throw new Error(pkgErr.message);
    extraPkgIds = (openPkgs ?? []).map((p) => p.id as string);
  }

  const allPkgIds = [...new Set([...packageIds, ...extraPkgIds])];
  if (allPkgIds.length > 0) {
    const pkgPatch: { tutor_id: string; student_id?: string } = { tutor_id: to.tutorId };
    if (to.studentId !== fromStudentId) pkgPatch.student_id = to.studentId;
    const { error } = await supabase.from('lesson_packages').update(pkgPatch).in('id', allPkgIds);
    if (error) throw new Error(error.message);
  }

  const recPatch =
    to.studentId !== fromStudentId
      ? { student_id: to.studentId, tutor_id: to.tutorId }
      : { tutor_id: to.tutorId };
  const { error: recErr } = await supabase
    .from('recurring_individual_sessions')
    .update(recPatch)
    .eq('student_id', fromStudentId)
    .eq('active', true);
  if (recErr) throw new Error(recErr.message);

  return { movedSessions: sessionIds.length, movedPackages: allPkgIds.length };
}

async function leftoverLessonCount(supabase: SupabaseClient, studentId: string): Promise<number> {
  const [{ data: sessRows, error: sErr }, { data: pkgRows, error: pErr }] = await Promise.all([
    supabase.from('sessions').select('id').eq('student_id', studentId).limit(1),
    supabase.from('lesson_packages').select('id').eq('student_id', studentId).limit(1),
  ]);
  if (sErr) throw new Error(sErr.message);
  if (pErr) throw new Error(pErr.message);
  return (sessRows?.length ?? 0) + (pkgRows?.length ?? 0);
}

export type RemoveTutorPairingMode = 'detached' | 'deleted';

/**
 * Remove a tutor from an org student group without CASCADE-deleting paid/scheduled lessons.
 * If the student was switched onto exactly one other tutor, open lessons move there first.
 */
export async function removeOrgStudentTutorPairing(
  supabase: SupabaseClient,
  args: { rowId: string; remainingGroup: PairingRef[] },
): Promise<{ mode: RemoveTutorPairingMode }> {
  const target = targetPairingForRemovedRow(args.remainingGroup);
  if (target) {
    await reassignOpenLessonsToTutor(supabase, args.rowId, {
      studentId: target.id,
      tutorId: target.tutorId,
    });
  }

  const leftover = await leftoverLessonCount(supabase, args.rowId);
  if (canHardDeleteStudentPairing(args.remainingGroup.length, leftover)) {
    const { error } = await supabase.from('students').delete().eq('id', args.rowId);
    if (error) throw new Error(error.message);
    return { mode: 'deleted' };
  }

  const { error } = await supabase.from('students').update({ tutor_id: null }).eq('id', args.rowId);
  if (error) throw new Error(error.message);
  return { mode: 'detached' };
}
