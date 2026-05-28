/**
 * Booking-side helpers for multi-subject lesson packages.
 *
 * When a session is created from the Calendar / OrgAdmin flows we need to:
 *   1. Find a paid+active package that has an item matching the selected subject
 *      with at least one available lesson left.
 *   2. Reserve a slot on that item (and the parent aggregate counters).
 *
 * After the backfill migration every package row has at least one item row,
 * so we can always go through `lesson_package_items`.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type PackageItemForBooking = {
  id: string;
  subject_id: string;
  available_lessons: number;
  reserved_lessons: number;
  total_lessons: number;
  completed_lessons: number;
};

export type PackageForBooking = {
  id: string;
  tutor_id: string;
  student_id: string;
  subject_id: string | null;
  total_lessons: number;
  available_lessons: number;
  reserved_lessons: number;
  completed_lessons: number;
  expires_at: string | null;
  items: PackageItemForBooking[];
};

/**
 * Find one paid+active package whose items list contains a row for `subjectId`
 * with `available_lessons > 0`. Returns the package + the matching item, or
 * `null` when nothing matches.
 */
export async function findActivePackageForBooking(
  supabase: SupabaseClient,
  args: { studentId: string; subjectId: string },
): Promise<{ pkg: PackageForBooking; item: PackageItemForBooking } | null> {
  const { studentId, subjectId } = args;

  const { data, error } = await supabase
    .from('lesson_packages')
    .select(
      `
      id, tutor_id, student_id, subject_id, total_lessons, available_lessons,
      reserved_lessons, completed_lessons, expires_at,
      lesson_package_items!inner(id, subject_id, available_lessons, reserved_lessons, total_lessons, completed_lessons)
      `,
    )
    .eq('student_id', studentId)
    .eq('active', true)
    .eq('paid', true)
    .gt('available_lessons', 0)
    .eq('lesson_package_items.subject_id', subjectId)
    .gt('lesson_package_items.available_lessons', 0)
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) {
    console.warn('[lessonPackageBooking] find error', error.code, error.message);
    return null;
  }
  const row = (data || [])[0] as any;
  if (!row) return null;

  const itemsRaw = Array.isArray(row.lesson_package_items) ? row.lesson_package_items : [];
  const matchItem = itemsRaw.find((it: any) => it.subject_id === subjectId);
  if (!matchItem) return null;

  const pkg: PackageForBooking = {
    id: row.id,
    tutor_id: row.tutor_id,
    student_id: row.student_id,
    subject_id: row.subject_id,
    total_lessons: Number(row.total_lessons || 0),
    available_lessons: Number(row.available_lessons || 0),
    reserved_lessons: Number(row.reserved_lessons || 0),
    completed_lessons: Number(row.completed_lessons || 0),
    expires_at: row.expires_at,
    items: itemsRaw.map((it: any) => ({
      id: it.id,
      subject_id: it.subject_id,
      available_lessons: Number(it.available_lessons || 0),
      reserved_lessons: Number(it.reserved_lessons || 0),
      total_lessons: Number(it.total_lessons || 0),
      completed_lessons: Number(it.completed_lessons || 0),
    })),
  };
  const item: PackageItemForBooking = {
    id: matchItem.id,
    subject_id: matchItem.subject_id,
    available_lessons: Number(matchItem.available_lessons || 0),
    reserved_lessons: Number(matchItem.reserved_lessons || 0),
    total_lessons: Number(matchItem.total_lessons || 0),
    completed_lessons: Number(matchItem.completed_lessons || 0),
  };
  return { pkg, item };
}

/**
 * Decrement counters for `usageBySubject` slots booked from a single package.
 * Updates both the per-subject items and the parent aggregate.
 */
export async function applyPackageBookingUsage(
  supabase: SupabaseClient,
  args: {
    pkg: PackageForBooking;
    usageBySubject: Map<string, number>;
  },
): Promise<{ ok: boolean; error?: string }> {
  const { pkg, usageBySubject } = args;
  if (usageBySubject.size === 0) return { ok: true };

  let totalDelta = 0;
  for (const [subjectId, used] of usageBySubject.entries()) {
    if (used <= 0) continue;
    const item = pkg.items.find((it) => it.subject_id === subjectId);
    if (!item) continue;
    const { error } = await supabase
      .from('lesson_package_items')
      .update({
        available_lessons: item.available_lessons - used,
        reserved_lessons: item.reserved_lessons + used,
      })
      .eq('id', item.id);
    if (error) return { ok: false, error: error.message };
    totalDelta += used;
  }

  if (totalDelta === 0) return { ok: true };

  const { error } = await supabase
    .from('lesson_packages')
    .update({
      available_lessons: pkg.available_lessons - totalDelta,
      reserved_lessons: pkg.reserved_lessons + totalDelta,
    })
    .eq('id', pkg.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
