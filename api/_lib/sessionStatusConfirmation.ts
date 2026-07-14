// Shared logic for the org feature "tutor_lesson_status_confirmation":
// flagged-org lessons are excluded from cron auto-completion and instead
// finalized explicitly via /api/confirm-session-status.

import type { SupabaseClient } from '@supabase/supabase-js';

export type SessionForCompletion = {
  id: string;
  tutor_id: string | null;
  lesson_package_id?: string | null;
  subject_id?: string | null;
};

/** Org ids (from the given set) whose features enable tutor status confirmation. */
export async function orgsRequiringStatusConfirmation(
  supabase: SupabaseClient,
  orgIds: string[],
): Promise<Set<string>> {
  const flagged = new Set<string>();
  const unique = [...new Set(orgIds.filter(Boolean))];
  if (unique.length === 0) return flagged;
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, features')
    .in('id', unique);
  for (const org of (orgs ?? []) as Array<{ id: string; features?: Record<string, unknown> | null }>) {
    if (org.features && (org.features as Record<string, unknown>).tutor_lesson_status_confirmation === true) {
      flagged.add(org.id);
    }
  }
  return flagged;
}

/**
 * Splits ended-but-active sessions into ones the cron may auto-complete and ones
 * that must wait for an explicit tutor confirmation (tutor's org has the flag).
 */
export async function partitionByStatusConfirmation<T extends SessionForCompletion>(
  supabase: SupabaseClient,
  sessions: T[],
): Promise<{ autoCompletable: T[]; awaitingConfirmation: T[] }> {
  const tutorIds = [...new Set(sessions.map((s) => s.tutor_id).filter(Boolean))] as string[];
  if (tutorIds.length === 0) return { autoCompletable: sessions, awaitingConfirmation: [] };

  const { data: tutors } = await supabase
    .from('profiles')
    .select('id, organization_id')
    .in('id', tutorIds);
  const orgByTutor = new Map(
    ((tutors ?? []) as Array<{ id: string; organization_id: string | null }>).map((t) => [t.id, t.organization_id]),
  );
  const flaggedOrgs = await orgsRequiringStatusConfirmation(
    supabase,
    [...orgByTutor.values()].filter(Boolean) as string[],
  );

  const autoCompletable: T[] = [];
  const awaitingConfirmation: T[] = [];
  for (const s of sessions) {
    const orgId = s.tutor_id ? orgByTutor.get(s.tutor_id) : null;
    if (orgId && flaggedOrgs.has(orgId)) awaitingConfirmation.push(s);
    else autoCompletable.push(s);
  }
  return { autoCompletable, awaitingConfirmation };
}

/**
 * Moves lesson-package counters reserved → completed for the given sessions
 * (per-subject package items first, then the parent package aggregates).
 * Mirrors the long-standing auto-complete cron behavior.
 */
export async function movePackageCountersToCompleted(
  supabase: SupabaseClient,
  sessions: SessionForCompletion[],
): Promise<number> {
  const withPackages = sessions.filter((s) => s.lesson_package_id);
  const packageIds = [...new Set(withPackages.map((s) => s.lesson_package_id))] as string[];
  if (packageIds.length === 0) return 0;

  const { data: items } = await supabase
    .from('lesson_package_items')
    .select('id, package_id, subject_id, reserved_lessons, completed_lessons')
    .in('package_id', packageIds);

  for (const it of (items ?? []) as any[]) {
    const completedCount = withPackages.filter(
      (s) => s.lesson_package_id === it.package_id && s.subject_id === it.subject_id,
    ).length;
    if (completedCount > 0) {
      await supabase
        .from('lesson_package_items')
        .update({
          reserved_lessons: Math.max(0, Number(it.reserved_lessons || 0) - completedCount),
          completed_lessons: Number(it.completed_lessons || 0) + completedCount,
        })
        .eq('id', it.id);
    }
  }

  const { data: packages } = await supabase
    .from('lesson_packages')
    .select('id, reserved_lessons, completed_lessons')
    .in('id', packageIds);

  for (const pkg of (packages ?? []) as any[]) {
    const completedCount = withPackages.filter((s) => s.lesson_package_id === pkg.id).length;
    if (completedCount > 0) {
      await supabase
        .from('lesson_packages')
        .update({
          reserved_lessons: Math.max(0, Number(pkg.reserved_lessons || 0) - completedCount),
          completed_lessons: Number(pkg.completed_lessons || 0) + completedCount,
        })
        .eq('id', pkg.id);
    }
  }

  return packageIds.length;
}

/** Returns one reserved package lesson back to available (post-end "atšaukta" confirmation). */
export async function returnPackageCounterToAvailable(
  supabase: SupabaseClient,
  session: SessionForCompletion,
): Promise<void> {
  const packageId = session.lesson_package_id;
  if (!packageId) return;

  const { data: pkg } = await supabase
    .from('lesson_packages')
    .select('id, available_lessons, reserved_lessons')
    .eq('id', packageId)
    .maybeSingle();
  if (!pkg) return;

  if (session.subject_id) {
    const { data: item } = await supabase
      .from('lesson_package_items')
      .select('id, available_lessons, reserved_lessons')
      .eq('package_id', packageId)
      .eq('subject_id', session.subject_id)
      .maybeSingle();
    if (item) {
      await supabase
        .from('lesson_package_items')
        .update({
          available_lessons: Number((item as any).available_lessons || 0) + 1,
          reserved_lessons: Math.max(0, Number((item as any).reserved_lessons || 0) - 1),
        })
        .eq('id', (item as any).id);
    }
  }

  await supabase
    .from('lesson_packages')
    .update({
      available_lessons: Number((pkg as any).available_lessons || 0) + 1,
      reserved_lessons: Math.max(0, Number((pkg as any).reserved_lessons || 0) - 1),
    })
    .eq('id', packageId);
}

/** Waitlist rows for finalized sessions are obsolete. */
export async function deleteSessionWaitlists(
  supabase: SupabaseClient,
  sessionIds: string[],
): Promise<number> {
  if (sessionIds.length === 0) return 0;
  const { count } = await supabase
    .from('waitlists')
    .delete({ count: 'exact' })
    .in('session_id', sessionIds);
  return count || 0;
}
