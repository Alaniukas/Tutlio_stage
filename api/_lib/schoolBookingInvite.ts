import type { SupabaseClient } from '@supabase/supabase-js';

const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';

type InviteRecipient = { email: string; recipientName: string };

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/** Sends child booking invite emails after the first school installment is paid (or confirmed free). */
export async function sendSchoolBookingInvites(
  supabase: SupabaseClient,
  params: {
    studentId: string;
    schoolOrgId?: string | null;
    serviceRoleKey: string;
  },
): Promise<boolean> {
  const studentId = String(params.studentId || '').trim();
  if (!studentId) return false;

  const { data: student } = await supabase
    .from('students')
    .select('id, invite_code, full_name, email, payer_email, payer_name, parent_secondary_email, parent_secondary_name')
    .eq('id', studentId)
    .maybeSingle();

  if (!student) return false;

  let inviteCode = String(student.invite_code || '').trim();
  if (!inviteCode) {
    inviteCode = generateInviteCode();
    await supabase.from('students').update({ invite_code: inviteCode }).eq('id', student.id);
  }

  const childEmail = String(student.email || '').trim();
  const inviteRecipients: InviteRecipient[] = [];
  if (childEmail.includes('@')) {
    inviteRecipients.push({
      email: childEmail,
      recipientName: String(student.full_name || '').trim() || childEmail,
    });
  } else {
    const pushUnique = (email: string | null | undefined, name: string | null | undefined) => {
      const em = String(email || '').trim();
      if (!em.includes('@')) return;
      if (inviteRecipients.some((r) => r.email.toLowerCase() === em.toLowerCase())) return;
      inviteRecipients.push({
        email: em,
        recipientName: String(name || '').trim() || em,
      });
    };
    pushUnique(student.payer_email, student.payer_name);
    pushUnique(student.parent_secondary_email, student.parent_secondary_name);
  }

  if (inviteRecipients.length === 0) return false;

  let schoolName = 'Mokykla';
  const schoolOrgId = params.schoolOrgId || null;
  if (schoolOrgId) {
    const { data: orgRow } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', schoolOrgId)
      .maybeSingle();
    if (orgRow?.name) schoolName = String(orgRow.name);
  }

  const bookingUrl = `${APP_URL}/book/${inviteCode}`;
  for (const recipient of inviteRecipients) {
    await fetch(`${APP_URL}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': params.serviceRoleKey },
      body: JSON.stringify({
        type: 'invite_email',
        to: recipient.email,
        data: {
          context: 'school',
          studentName: student.full_name,
          recipientName: recipient.recipientName,
          tutorName: schoolName,
          inviteCode,
          bookingUrl,
          ...(schoolOrgId ? { organizationId: schoolOrgId } : {}),
        },
      }),
    }).catch(() => {});
  }

  return true;
}

export async function markSchoolInstallmentPaidAndMaybeInvite(
  supabase: SupabaseClient,
  installmentId: string,
  options: {
    serviceRoleKey: string;
    stripePaymentIntentId?: string | null;
    studentId?: string | null;
  },
): Promise<{ success: boolean; error?: string; invitesSent?: boolean }> {
  const { data: updatedInstallment, error: updateErr } = await supabase
    .from('school_payment_installments')
    .update({
      payment_status: 'paid',
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: options.stripePaymentIntentId ?? null,
    })
    .eq('id', installmentId)
    .eq('payment_status', 'pending')
    .select('id, installment_number, amount, contract_id')
    .maybeSingle();

  if (updateErr) return { success: false, error: updateErr.message };

  const effectiveInstallment = updatedInstallment
    ? updatedInstallment
    : (await supabase
        .from('school_payment_installments')
        .select('id, installment_number, amount, contract_id')
        .eq('id', installmentId)
        .maybeSingle()).data;

  if (!effectiveInstallment) return { success: false, error: 'Installment not found' };

  const { data: contractRow } = await supabase
    .from('school_contracts')
    .select('organization_id, student_id')
    .eq('id', effectiveInstallment.contract_id)
    .maybeSingle();

  const { data: allInstallments } = await supabase
    .from('school_payment_installments')
    .select('id, payment_status, installment_number')
    .eq('contract_id', effectiveInstallment.contract_id)
    .order('installment_number');

  const paidInstallments = (allInstallments || []).filter((i) => i.payment_status === 'paid');
  const firstPaid = paidInstallments.length === 1 ? paidInstallments[0] : null;
  let invitesSent = false;

  if (updatedInstallment && firstPaid?.id === installmentId) {
    const studentId = String(options.studentId || contractRow?.student_id || '').trim();
    if (studentId) {
      invitesSent = await sendSchoolBookingInvites(supabase, {
        studentId,
        schoolOrgId: contractRow?.organization_id || null,
        serviceRoleKey: options.serviceRoleKey,
      });
    }
  }

  return { success: true, invitesSent };
}

/** Installment charge total in EUR (base row amount + optional first-installment additional fee). */
export function schoolInstallmentChargeEur(
  installment: { installment_number: number; amount: number | string },
  contract?: { additional_fee_amount?: number | string | null } | null,
): number {
  const baseEur = Number(installment.amount || 0);
  const extraEurRaw = Number(contract?.additional_fee_amount || 0);
  const extraEur = installment.installment_number === 1 && extraEurRaw > 0 ? extraEurRaw : 0;
  return baseEur + extraEur;
}
