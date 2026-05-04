/** Mirrors src/lib/subscription.ts tutor manual-payment flag — works for both solo and org tutors. */

export type TutorManualPaymentProfile = {
  organization_id?: string | null;
  subscription_plan?: string | null;
  manual_subscription_exempt?: boolean | null;
  enable_manual_student_payments?: boolean | null;
  manual_payment_bank_details?: string | null;
};

/** Tutor uses manual (non-Stripe) student payments — works for both solo and org tutors. */
export function tutorUsesManualStudentPayments(p: TutorManualPaymentProfile | null | undefined): boolean {
  if (!p) return false;
  if (p.organization_id) {
    return p.enable_manual_student_payments === true;
  }
  return (
    p.subscription_plan === 'subscription_only' ||
    p.manual_subscription_exempt === true ||
    p.enable_manual_student_payments === true
  );
}

/** @deprecated Use tutorUsesManualStudentPayments instead */
export function soloTutorUsesManualStudentPayments(p: TutorManualPaymentProfile | null | undefined): boolean {
  return tutorUsesManualStudentPayments(p);
}

export function trimManualPaymentBankDetails(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim();
}
