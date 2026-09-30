import { authHeaders } from '@/lib/apiHelpers';
import type { SchoolTutorPayRow } from './schoolTutorLessonPay';

/** Standalone attendance has no browser table access; the API authorizes the teacher scope. */
export async function fetchSchoolTutorAttendancePayRows(input: {
  tutorId: string;
  periodStart: string;
  periodEnd: string;
}): Promise<SchoolTutorPayRow[]> {
  const query = new URLSearchParams(input);
  const response = await fetch(`/api/school-tutor-attendance-pay?${query}`, { headers: await authHeaders() });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true || !Array.isArray(result.rows)
    || result.rows.some((row: SchoolTutorPayRow | null) => !row || row.source_kind !== 'attendance')) {
    throw new Error('Could not load school attendance pay.');
  }
  return result.rows;
}
