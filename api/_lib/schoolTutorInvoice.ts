import type { SupabaseClient } from '@supabase/supabase-js';
import { schoolDate } from '../../src/lib/schoolTime.js';
import { schoolTutorPayOccurrences } from '../../src/lib/schoolTutorLessonPay.js';
import { fetchAllRows } from '../../src/lib/fetchAllRows.js';
import { orgRequiresTutorStatusConfirmation } from '../../src/lib/sessionStatusConfirmation.js';
import { loadSchoolTutorAttendancePayRows } from './schoolTutorAttendancePay.js';

export const SCHOOL_TUTOR_INVOICE_LAYOUT = 'school_tutor_meetings';
export class SchoolTutorInvoiceSelectionError extends Error {}

/** Attendance IDs and occurrence keys survive later materialization of child sessions. */
export async function findSchoolAttendanceDuplicateInvoices(db: SupabaseClient, input: {
  organizationId: string; tutorId: string; meetingKeys: string[]; attendanceIds: string[];
}) {
  const keys = new Set(input.meetingKeys);
  const invoices = await fetchAllRows<any>((from, to) => db.from('invoices')
    .select('id,invoice_number,total_amount,pdf_meta').eq('organization_id', input.organizationId)
    .neq('status', 'cancelled').order('id').range(from, to));
  const ownInvoices = invoices.filter(invoice => invoice.pdf_meta?.layout === SCHOOL_TUTOR_INVOICE_LAYOUT
    && invoice.pdf_meta?.tutorId === input.tutorId);
  const ownIds = new Set(ownInvoices.map(invoice => invoice.id));
  const duplicateIds = new Set<string>(ownInvoices.filter(invoice => Array.isArray(invoice.pdf_meta?.schoolMeetingKeys)
    && invoice.pdf_meta.schoolMeetingKeys.some((key: string) => keys.has(key))).map(invoice => invoice.id));
  // Bound URL length as well as response size for large groups.
  for (let offset = 0; offset < input.attendanceIds.length; offset += 200) {
    const ids = input.attendanceIds.slice(offset, offset + 200);
    const items = await fetchAllRows<any>((from, to) => db.from('invoice_line_items')
      .select('invoice_id,school_attendance_ids').overlaps('school_attendance_ids', ids)
      .order('id').range(from, to));
    for (const item of items) if (ownIds.has(item.invoice_id)) duplicateIds.add(item.invoice_id);
  }
  return ownInvoices.filter(invoice => duplicateIds.has(invoice.id));
}

/** Load full occurrences even when a caller submits only one child from a group. */
export async function loadSchoolTutorInvoiceRows(db: SupabaseClient, select: string, input: {
  tutorId: string; periodStart: string; periodEnd: string; sessionIds?: string[]; attendanceIds?: string[]; studentId?: string;
  defaultRate: number | null; individualRate?: number | null; now: Date; organizationId?: string | null; features?: Record<string, unknown> | null;
}) {
  const from = schoolDate(input.periodStart);
  const until = schoolDate(input.periodEnd);
  until.setDate(until.getDate() + 1);
  const rows = await fetchAllRows<any>((fromRow, toRow) => {
    let query = db.from('sessions').select(select).eq('tutor_id', input.tutorId)
      .gte('start_time', from.toISOString()).lt('start_time', until.toISOString())
      .lte('end_time', input.now.toISOString());
    if (input.organizationId) query = query.eq('students.organization_id', input.organizationId);
    return query.order('start_time').order('id').range(fromRow, toRow);
  });
  const attendanceRows = input.organizationId ? await loadSchoolTutorAttendancePayRows(db, {
    tutorId: input.tutorId, organizationId: input.organizationId, periodStart: input.periodStart,
    periodEnd: input.periodEnd, now: input.now,
  }) : [];
  const allRows = [...rows, ...attendanceRows];
  const occurrences = schoolTutorPayOccurrences(allRows, input.defaultRate, input.now, {
    requireConfirmation: orgRequiresTutorStatusConfirmation(input.organizationId, input.features),
    individualRate: input.individualRate,
  });
  const selectedIds = new Set(input.sessionIds || []);
  const selectedAttendanceIds = new Set((input.attendanceIds || []).map(id => id.toLowerCase()));
  if (selectedIds.size) {
    const selected = rows.filter(row => selectedIds.has(row.id));
    const eligibleIds = new Set(occurrences.flatMap(occurrence => occurrence.sessionIds));
    if (selected.length !== selectedIds.size || selected.some(row => !eligibleIds.has(row.id))) {
      throw new SchoolTutorInvoiceSelectionError('Selected school lessons changed; refresh the invoice preview');
    }
  }
  if (selectedAttendanceIds.size) {
    const eligibleIds = new Set(occurrences.flatMap(occurrence => occurrence.attendanceIds));
    if ([...selectedAttendanceIds].some(id => !eligibleIds.has(id))) {
      throw new SchoolTutorInvoiceSelectionError('Selected school attendance changed; refresh the invoice preview');
    }
  }
  const chosen = selectedIds.size || selectedAttendanceIds.size
    ? occurrences.filter(occurrence => occurrence.sessionIds.some(id => selectedIds.has(id))
      || occurrence.attendanceIds.some(id => selectedAttendanceIds.has(id)))
    : input.studentId
      ? occurrences.filter(occurrence => allRows.some(row => (occurrence.sessionIds.includes(row.id)
          || occurrence.attendanceIds.includes(row.id)) && row.student_id === input.studentId))
      : occurrences;
  return chosen;
}
