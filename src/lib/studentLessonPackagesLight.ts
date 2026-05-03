/**
 * Lightweight `lesson_packages` reads for logged-in student flows (layout badge,
 * StudentDashboard, StudentSchedule, StudentSessions).
 *
 * Intentionally omits nested `select('…, subjects(name)')` — that embed forces
 * an extra FK hop under RLS and has been pegging Postgres with statement timeouts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { dedupeAsync } from '@/lib/dataCache';

export type StudentActivePackageRow = {
  id: string;
  subject_id: string | null;
  total_lessons: number | null;
  available_lessons: number | null;
  reserved_lessons: number | null;
  expires_at: string | null;
};

export async function fetchStudentActiveLessonPackagesDeduped(
  supabase: SupabaseClient,
  studentId: string,
): Promise<StudentActivePackageRow[]> {
  return dedupeAsync(`lesson_pkg_active_${studentId}`, async () => {
    const res = await supabase
      .from('lesson_packages')
      .select(
        'id, subject_id, total_lessons, available_lessons, reserved_lessons, expires_at',
      )
      .eq('student_id', studentId)
      .eq('active', true)
      .eq('paid', true)
      .gt('available_lessons', 0)
      .order('created_at', { ascending: false })
      .limit(64);

    if (res.error) {
      console.warn(
        '[lesson_packages] Active-package query:',
        res.error.code,
        res.error.message,
      );
      return [];
    }
    return (res.data ?? []) as StudentActivePackageRow[];
  });
}

/** Single round-trip lookup of subject titles by UUID (PK)—cheap vs nested embed. */
export async function fetchSubjectNamesByIds(
  supabase: SupabaseClient,
  subjectIds: string[],
): Promise<Record<string, string>> {
  const ids = [...new Set(subjectIds.filter(Boolean))];
  if (ids.length === 0) return {};

  const res = await supabase.from('subjects').select('id,name').in('id', ids);
  if (res.error) return {};
  const map: Record<string, string> = {};
  for (const s of res.data ?? []) {
    map[(s as { id: string }).id] = (s as { name: string }).name;
  }
  return map;
}
