import type { SupabaseClient } from '@supabase/supabase-js';
import { copyStudentParentLinksForTutorPairing } from '@/lib/studentParentLinks.js';

/** Upcoming / held lessons — history (completed, cancelled, no_show) stays with the old tutor. */
export const OPEN_LESSON_SESSION_STATUSES = ['active'] as const;

export type PairingRef = { id: string; tutor_id: string | null };

export async function reassignOpenLessonsToTutor(
  supabase: SupabaseClient,
  fromStudentId: string,
  to: { studentId: string; tutorId: string },
): Promise<{ movedSessions: number; movedPackages: number }> {
  if (to.studentId !== fromStudentId) {
    await copyStudentParentLinksForTutorPairing(supabase, fromStudentId, to.studentId);
  }
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

export type RemoveTutorPairingMode = 'detached' | 'deleted';

/**
 * Stop this tutor's future individual lessons and remove the assignment in one
 * transaction. Remaining tutors are family-link recipients, never transfer targets.
 */
export async function removeOrgStudentTutorPairing(
  supabase: SupabaseClient,
  args: { rowId: string; expectedTutorId: string | null; remainingGroup: PairingRef[] },
): Promise<{ mode: RemoveTutorPairingMode }> {
  const { data, error } = await supabase.rpc('remove_org_student_tutor_pairing', {
    p_student_id: args.rowId,
    p_expected_tutor_id: args.expectedTutorId,
    p_remaining_student_ids: [...new Set(args.remainingGroup.map((row) => row.id))],
  });
  if (error) throw error;
  if (data?.mode !== 'detached' && data?.mode !== 'deleted') {
    throw new Error('Invalid tutor removal response');
  }
  return { mode: data.mode };
}

export function tutorPairingRemovalErrorKey(error: unknown): string {
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if (message.includes('tutor_pairing_billing_review_required')) return 'compStu.tutorRemovalBilling';
  if (message.includes('tutor_pairing_changed')) return 'compStu.tutorRemovalChanged';
  return 'compStu.tutorRemoveFailed';
}
