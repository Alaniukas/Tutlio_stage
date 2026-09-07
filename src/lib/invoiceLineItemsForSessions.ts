import type { SupabaseClient } from '@supabase/supabase-js';

const SESSION_QUERY_BATCH = 16;

/**
 * Resolve invoice IDs linked to session rows via `invoice_line_items.session_ids`.
 * Uses `.contains()` (PostgREST `@>`) — portable across Supabase client versions.
 */
export async function fetchInvoiceIdsForSessionIds(
  sb: SupabaseClient,
  sessionIds: string[],
): Promise<Set<string>> {
  const ids = new Set<string>();
  const unique = [...new Set(sessionIds.map((id) => String(id).trim()).filter(Boolean))];
  if (unique.length === 0) return ids;

  for (let i = 0; i < unique.length; i += SESSION_QUERY_BATCH) {
    const batch = unique.slice(i, i + SESSION_QUERY_BATCH);
    await Promise.all(
      batch.map(async (sessionId) => {
        const { data, error } = await sb
          .from('invoice_line_items')
          .select('invoice_id')
          .contains('session_ids', [sessionId]);
        if (error) throw error;
        for (const row of data || []) {
          const invoiceId = (row as { invoice_id?: string | null }).invoice_id;
          if (invoiceId) ids.add(String(invoiceId));
        }
      }),
    );
  }
  return ids;
}

/** Per-student invoice IDs from packages + session line items. */
export async function fetchStudentInvoiceIdsMap(
  sb: SupabaseClient,
  studentIds: string[],
): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  for (const id of studentIds) map.set(id, new Set());

  if (studentIds.length === 0) return map;

  const { data: packages, error: pkgErr } = await sb
    .from('lesson_packages')
    .select('student_id, manual_sales_invoice_id')
    .in('student_id', studentIds)
    .not('manual_sales_invoice_id', 'is', null);
  if (pkgErr) throw pkgErr;
  for (const row of packages || []) {
    const studentId = String((row as { student_id: string }).student_id);
    const invoiceId = (row as { manual_sales_invoice_id?: string | null }).manual_sales_invoice_id;
    if (invoiceId) map.get(studentId)?.add(String(invoiceId));
  }

  const { data: sessions, error: sessErr } = await sb
    .from('sessions')
    .select('id, student_id')
    .in('student_id', studentIds);
  if (sessErr) throw sessErr;

  const sessionToStudent = new Map<string, string>();
  const sessionIds: string[] = [];
  for (const row of sessions || []) {
    const sessionId = String((row as { id: string }).id);
    sessionToStudent.set(sessionId, String((row as { student_id: string }).student_id));
    sessionIds.push(sessionId);
  }

  if (sessionIds.length === 0) return map;

  for (let i = 0; i < sessionIds.length; i += SESSION_QUERY_BATCH) {
    const batch = sessionIds.slice(i, i + SESSION_QUERY_BATCH);
    await Promise.all(
      batch.map(async (sessionId) => {
        const studentId = sessionToStudent.get(sessionId);
        if (!studentId) return;
        const { data, error } = await sb
          .from('invoice_line_items')
          .select('invoice_id')
          .contains('session_ids', [sessionId]);
        if (error) throw error;
        for (const row of data || []) {
          const invoiceId = (row as { invoice_id?: string | null }).invoice_id;
          if (invoiceId) map.get(studentId)?.add(String(invoiceId));
        }
      }),
    );
  }

  return map;
}
