import { supabase } from './supabase';
import { defaultSessionPaymentStatusForStudent } from './studentPaymentModel';

/** Restore an unpaid org lesson to its booking state after an admin payment edit. */
export async function unpaidOrgSessionPaymentStatus(
  organizationId: string | null | undefined,
  studentId: string,
): Promise<'pending' | 'confirmed'> {
  if (!organizationId || !studentId) throw new Error('Organization or student unavailable');
  const [studentResult, orgResult] = await Promise.all([
    supabase.from('students').select('payment_model').eq('id', studentId).maybeSingle(),
    supabase.from('organizations')
      .select('enable_per_lesson, enable_monthly_billing')
      .eq('id', organizationId).maybeSingle(),
  ]);
  if (studentResult.error || !studentResult.data || orgResult.error || !orgResult.data) {
    throw new Error('Student or organization billing settings unavailable');
  }
  const status = defaultSessionPaymentStatusForStudent(studentResult.data.payment_model, {
    paid: false,
    hasPackage: false,
    billingFlags: orgResult.data,
  });
  return status === 'pending' ? 'pending' : 'confirmed';
}
