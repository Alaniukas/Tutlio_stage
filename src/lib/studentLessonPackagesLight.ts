/**
 * Lightweight `lesson_packages` reads for logged-in student flows (layout badge,
 * StudentDashboard, StudentSchedule, StudentSessions).
 *
 * Intentionally omits nested `select('…, subjects(name)')` — that embed forces
 * an extra FK hop under RLS and has been pegging Postgres with statement timeouts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { dedupeAsync } from '@/lib/dataCache';

export type StudentActivePackageItemRow = {
  subject_id: string;
  total_lessons: number;
  available_lessons: number;
  reserved_lessons: number;
  completed_lessons: number;
};

export type StudentActivePackageRow = {
  id: string;
  subject_id: string | null;
  total_lessons: number | null;
  available_lessons: number | null;
  reserved_lessons: number | null;
  expires_at: string | null;
  /** Per-subject breakdown. Multi-subject packages list >1 item; legacy single-subject packages list 1. */
  items: StudentActivePackageItemRow[];
};

export async function fetchStudentActiveLessonPackagesDeduped(
  supabase: SupabaseClient,
  studentId: string,
): Promise<StudentActivePackageRow[]> {
  return dedupeAsync(`lesson_pkg_active_${studentId}`, async () => {
    const res = await supabase
      .from('lesson_packages')
      .select(
        `
        id, subject_id, total_lessons, available_lessons, reserved_lessons, expires_at,
        lesson_package_items(subject_id, total_lessons, available_lessons, reserved_lessons, completed_lessons)
        `,
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
    return ((res.data ?? []) as any[]).map((row): StudentActivePackageRow => {
      const itemsRaw = Array.isArray(row.lesson_package_items) ? row.lesson_package_items : [];
      const items: StudentActivePackageItemRow[] = itemsRaw.map((it: any) => ({
        subject_id: String(it.subject_id),
        total_lessons: Number(it.total_lessons || 0),
        available_lessons: Number(it.available_lessons || 0),
        reserved_lessons: Number(it.reserved_lessons || 0),
        completed_lessons: Number(it.completed_lessons || 0),
      }));
      return {
        id: row.id,
        subject_id: row.subject_id,
        total_lessons: row.total_lessons,
        available_lessons: row.available_lessons,
        reserved_lessons: row.reserved_lessons,
        expires_at: row.expires_at,
        items,
      };
    });
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
