import type { SupabaseClient } from '@supabase/supabase-js';
import {
  invoiceCountsAsUnpaid,
  packageCountsAsUnpaid,
  sessionCountsAsUnpaid,
} from '../../src/lib/moksloVaisiaiStudentArchive.js';
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

export async function studentHasUnpaidBalance(
  sb: SupabaseClient,
  studentId: string,
): Promise<boolean> {
  const [sessionsRes, packagesRes, invoicesRes] = await Promise.all([
    sb
      .from('sessions')
      .select('paid, payment_status, status, is_complimentary, price')
      .eq('student_id', studentId),
    sb
      .from('lesson_packages')
      .select('paid, payment_status')
      .eq('student_id', studentId),
    sb
      .from('invoices')
      .select('paid, payment_status')
      .eq('student_id', studentId),
  ]);
  if (sessionsRes.error) throw sessionsRes.error;
  if (packagesRes.error) throw packagesRes.error;
  if (invoicesRes.error) throw invoicesRes.error;

  if ((sessionsRes.data || []).some((row) => sessionCountsAsUnpaid(row))) return true;
  if ((packagesRes.data || []).some((row) => packageCountsAsUnpaid(row))) return true;
  if ((invoicesRes.data || []).some((row) => invoiceCountsAsUnpaid(row))) return true;
  return false;
}
