import type { SupabaseClient } from '@supabase/supabase-js';
import {
  invoiceCountsAsUnpaid,
  packageCountsAsUnpaid,
  sessionCountsAsUnpaid,
} from '../../src/lib/moksloVaisiaiStudentArchive.js';
import { fetchStudentInvoiceIdsMap } from '../../src/lib/invoiceLineItemsForSessions.js';
import { isMoksloVaisiaiOrg } from './marketMoney.js';

export { invoiceCountsAsUnpaid, packageCountsAsUnpaid, sessionCountsAsUnpaid };

export function studentBelongsToMoksloVaisiai(opts: {
  studentOrganizationId?: string | null;
  tutorOrganizationId?: string | null;
  tutorOrganizationSlug?: string | null;
}): boolean {
  return (
    isMoksloVaisiaiOrg(opts.studentOrganizationId) ||
    isMoksloVaisiaiOrg(opts.tutorOrganizationId) ||
    isMoksloVaisiaiOrg(opts.tutorOrganizationSlug)
  );
}

export const MOKSLO_VAISIAI_ARCHIVE_NOTE_PARENT =
  'Tėvai paprašė ištrinti vaiko paskyrą (archyvuota, 14 d.d.).';

export async function applyMoksloVaisiaiStudentArchive(
  sb: SupabaseClient,
  studentId: string,
): Promise<{ error: { message: string } | null }> {
  const now = new Date().toISOString();
  const { error } = await sb
    .from('students')
    .update({
      deletion_requested_at: now,
      enrollment_status: 'left',
      exit_reason: 'other',
      exit_date: now.slice(0, 10),
      exit_note: MOKSLO_VAISIAI_ARCHIVE_NOTE_PARENT,
    })
    .eq('id', studentId);
  return { error: error ? { message: error.message } : null };
}

/** Batch unpaid check — one round-trip per table instead of per child. */
export async function studentsUnpaidBalanceMap(
  sb: SupabaseClient,
  studentIds: string[],
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  const uniqueIds = [...new Set(studentIds.map((id) => String(id).trim()).filter(Boolean))];
  for (const id of uniqueIds) result.set(id, false);
  if (uniqueIds.length === 0) return result;

  const [sessionsRes, packagesRes] = await Promise.all([
    sb
      .from('sessions')
      .select('student_id, paid, payment_status, status, is_complimentary, price')
      .in('student_id', uniqueIds),
    sb
      .from('lesson_packages')
      .select('student_id, paid, payment_status, manual_sales_invoice_id')
      .in('student_id', uniqueIds),
  ]);
  if (sessionsRes.error) throw sessionsRes.error;
  if (packagesRes.error) throw packagesRes.error;

  for (const row of sessionsRes.data || []) {
    const studentId = String((row as { student_id: string }).student_id);
    if (sessionCountsAsUnpaid(row)) result.set(studentId, true);
  }
  for (const row of packagesRes.data || []) {
    const studentId = String((row as { student_id: string }).student_id);
    if (result.get(studentId)) continue;
    if (packageCountsAsUnpaid(row)) result.set(studentId, true);
  }

  const needsInvoiceCheck = uniqueIds.filter((id) => !result.get(id));
  if (needsInvoiceCheck.length === 0) return result;

  const invoiceIdsByStudent = await fetchStudentInvoiceIdsMap(sb, needsInvoiceCheck);
  const allInvoiceIds = new Set<string>();
  for (const id of needsInvoiceCheck) {
    for (const invId of invoiceIdsByStudent.get(id) ?? []) allInvoiceIds.add(invId);
  }
  if (allInvoiceIds.size === 0) return result;

  const { data: invoices, error: invErr } = await sb
    .from('invoices')
    .select('id, status')
    .in('id', [...allInvoiceIds]);
  if (invErr) throw invErr;

  const unpaidInvoiceIds = new Set(
    (invoices || []).filter((row) => invoiceCountsAsUnpaid(row)).map((row) => String(row.id)),
  );
  if (unpaidInvoiceIds.size === 0) return result;

  for (const studentId of needsInvoiceCheck) {
    if (result.get(studentId)) continue;
    for (const invId of invoiceIdsByStudent.get(studentId) ?? []) {
      if (unpaidInvoiceIds.has(invId)) {
        result.set(studentId, true);
        break;
      }
    }
  }

  return result;
}

export async function studentHasUnpaidBalance(
  sb: SupabaseClient,
  studentId: string,
): Promise<boolean> {
  const map = await studentsUnpaidBalanceMap(sb, [studentId]);
  return map.get(String(studentId)) ?? false;
}
