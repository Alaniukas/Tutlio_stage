import type { SupabaseClient } from '@supabase/supabase-js';
import { schoolContractAllowsInstallmentPayment } from './schoolContractPaymentGate.js';

const APP_URL = process.env.APP_URL || process.env.VITE_APP_URL || 'https://tutlio.lt';

export const SPLIT_CONTRACT_FEE_EUR = 50;
export const SPLIT_CONTRACT_FEE_DUE = '2026-07-31';

type InstallmentRow = {
  installment_number: number;
  amount: number | string;
  due_date?: string | null;
  payment_status?: string;
};

/** True when #1 is the standalone 50€ contract-fee row from the fee-split migration. */
export function isSplitContractFeeInstallment(
  installment: InstallmentRow,
  contract?: { additional_fee_amount?: number | string | null } | null,
  allInstallments?: Array<{ installment_number: number }>,
): boolean {
  if (installment.installment_number !== 1) return false;
  if (Math.abs(Number(installment.amount) - SPLIT_CONTRACT_FEE_EUR) > 0.01) return false;
  if (Number(contract?.additional_fee_amount || 0) > 0) return false;
  if (installment.due_date && installment.due_date !== SPLIT_CONTRACT_FEE_DUE) return false;
  if (allInstallments && !allInstallments.some((i) => i.installment_number > 1)) return false;
  return true;
}

async function sendSchoolInstallmentRequestEmail(
  serviceRoleKey: string,
  recipient: string,
  data: Record<string, unknown>,
): Promise<void> {
  await fetch(`${APP_URL}/api/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-internal-key': serviceRoleKey },
    body: JSON.stringify({ type: 'school_installment_request', to: recipient, data }),
  }).catch(() => {});
}

/** After the 50€ split fee is paid, email the next pending annual installment (LAŠKAS B). */
export async function sendNextPendingInstallmentAfterSplitFeePaid(
  supabase: SupabaseClient,
  contractId: string,
  serviceRoleKey: string,
  options?: { scheduleUpdated?: boolean; apologyForMissingEmail?: boolean },
): Promise<boolean> {
  const { data: contract } = await supabase
    .from('school_contracts')
    .select(
      'id, organization_id, signing_status, annual_fee, additional_fee_amount, additional_fee_purpose, student:students(full_name, email, payer_email, payer_name), organizations(name, email, features)',
    )
    .eq('id', contractId)
    .maybeSingle();

  if (!contract) return false;
  if (!schoolContractAllowsInstallmentPayment((contract as any).signing_status)) return false;

  const { data: installments } = await supabase
    .from('school_payment_installments')
    .select('id, installment_number, amount, due_date, payment_status')
    .eq('contract_id', contractId)
    .order('installment_number');

  if (!installments?.length) return false;

  const nextPending = installments.find(
    (i) => i.installment_number > 1 && i.payment_status === 'pending',
  );
  if (!nextPending) return false;

  const st = (contract as any).student || {};
  const org = (contract as any).organizations || {};
  const recipient = String(st.payer_email || st.email || '').trim();
  if (!recipient.includes('@')) return false;

  const orgFeatures =
    org.features && typeof org.features === 'object' && !Array.isArray(org.features)
      ? (org.features as Record<string, unknown>)
      : {};
  const orgContactEmail =
    (typeof orgFeatures.contact_email === 'string' && orgFeatures.contact_email.trim()) ||
    (typeof orgFeatures.school_contract_signing_email === 'string' &&
      orgFeatures.school_contract_signing_email.trim()) ||
    org.email ||
    '';

  await sendSchoolInstallmentRequestEmail(serviceRoleKey, recipient, {
    schoolName: org.name || '',
    schoolEmail: org.email || '',
    contactEmail: orgContactEmail,
    studentName: st.full_name || '',
    parentName: st.payer_name || st.full_name || '',
    recipientName: st.payer_name || st.full_name || '',
    installmentNumber: nextPending.installment_number,
    totalInstallments: installments.length,
    amount: Number(nextPending.amount || 0).toFixed(2),
    dueDate: nextPending.due_date
      ? new Date(nextPending.due_date).toLocaleDateString('lt-LT')
      : '—',
    installmentId: nextPending.id,
    contractAnnualFee: Number((contract as any).annual_fee || 0).toFixed(2),
    organizationId: (contract as any).organization_id,
    ...(options?.scheduleUpdated ? { scheduleUpdated: true } : {}),
    ...(options?.apologyForMissingEmail ? { apologyForMissingEmail: true } : {}),
  });

  return true;
}

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
    .select('id, installment_number, amount, due_date, contract_id')
    .maybeSingle();

  if (updateErr) return { success: false, error: updateErr.message };

  const effectiveInstallment = updatedInstallment
    ? updatedInstallment
    : (await supabase
        .from('school_payment_installments')
        .select('id, installment_number, amount, due_date, contract_id')
        .eq('id', installmentId)
        .maybeSingle()).data;

  if (!effectiveInstallment) return { success: false, error: 'Installment not found' };

  const { data: contractRow } = await supabase
    .from('school_contracts')
    .select('organization_id, student_id, additional_fee_amount')
    .eq('id', effectiveInstallment.contract_id)
    .maybeSingle();

  const { data: allInstallments } = await supabase
    .from('school_payment_installments')
    .select('id, payment_status, installment_number, amount, due_date')
    .eq('contract_id', effectiveInstallment.contract_id)
    .order('installment_number');

  const paidInstallments = (allInstallments || []).filter((i) => i.payment_status === 'paid');
  const firstPaid = paidInstallments.length === 1 ? paidInstallments[0] : null;
  let invitesSent = false;

  if (
    updatedInstallment &&
    isSplitContractFeeInstallment(effectiveInstallment, contractRow, allInstallments || [])
  ) {
    await sendNextPendingInstallmentAfterSplitFeePaid(
      supabase,
      effectiveInstallment.contract_id,
      options.serviceRoleKey,
      { scheduleUpdated: true },
    );
  }

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

/** Line-item breakdown for a single installment checkout (matches pay-school-installment). */
export function schoolInstallmentPaymentBreakdown(
  installment: { installment_number: number; amount: number | string },
  contract?: { additional_fee_amount?: number | string | null; additional_fee_purpose?: string | null } | null,
): { annualPortionEur: number; additionalPortionEur: number; totalEur: number; additionalPurpose: string } {
  const totalEur = Number(installment.amount || 0);
  const extraEurRaw = Number(contract?.additional_fee_amount || 0);
  const additionalPortionEur =
    installment.installment_number === 1 && extraEurRaw > 0 ? extraEurRaw : 0;
  const annualPortionEur = Math.max(0, totalEur - additionalPortionEur);
  const additionalPurpose = String(contract?.additional_fee_purpose || '').trim() || 'Sutarties mokestis';
  return { annualPortionEur, additionalPortionEur, totalEur, additionalPurpose };
}
