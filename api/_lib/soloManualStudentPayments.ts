/** Mirrors src/lib/subscription.ts solo tutor manual-payment flag (solo = no owning organization row on profile). */

export type TutorManualPaymentProfile = {
  organization_id?: string | null;
  subscription_plan?: string | null;
  manual_subscription_exempt?: boolean | null;
  enable_manual_student_payments?: boolean | null;
  manual_payment_bank_details?: string | null;
};

export function soloTutorUsesManualStudentPayments(p: TutorManualPaymentProfile | null | undefined): boolean {
  if (!p || p.organization_id) return false;
  return (
    p.subscription_plan === 'subscription_only' ||
    p.manual_subscription_exempt === true ||
    p.enable_manual_student_payments === true
  );
}

export function trimManualPaymentBankDetails(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim();
}
