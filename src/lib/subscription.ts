/**
 * Shared subscription status checks – single source of truth to avoid duplicated logic.
 */

export function hasActiveSubscription(status: string | null | undefined): boolean {
  return status === 'active' || status === 'trialing';
}

/** Whether the profile has any subscription status (including cancelled) – e.g. allow app access */
export function hasAnySubscriptionStatus(status: string | null | undefined): boolean {
  return status != null && status !== '';
}

/** Tutor app access: org member, any Stripe status, or manual override (external invoicing). */
export function tutorHasPlatformSubscriptionAccess(profile: {
  organization_id?: string | null;
  subscription_status?: string | null;
  manual_subscription_exempt?: boolean | null;
} | null | undefined): boolean {
  if (!profile) return false;
  return (
    !!profile.organization_id ||
    hasAnySubscriptionStatus(profile.subscription_status) ||
    profile.manual_subscription_exempt === true
  );
}

/** Fields needed to decide tutor student-facing manual (non-Stripe) lesson/package flows. */
export type ManualStudentPaymentProfileFields = {
  organization_id?: string | null;
  subscription_plan?: string | null;
  manual_subscription_exempt?: boolean | null;
  enable_manual_student_payments?: boolean | null;
};

/** @deprecated Use tutorUsesManualStudentPayments instead */
export type SoloManualStudentPaymentProfileFields = ManualStudentPaymentProfileFields;

/** Tutor uses manual (non-Stripe) student payments — works for both solo and org tutors. */
export function tutorUsesManualStudentPayments(profile: ManualStudentPaymentProfileFields | null | undefined): boolean {
  if (!profile) return false;
  if (profile.organization_id) {
    return profile.enable_manual_student_payments === true;
  }
  return (
    profile.subscription_plan === 'subscription_only' ||
    profile.manual_subscription_exempt === true ||
    profile.enable_manual_student_payments === true
  );
}

/** @deprecated Use tutorUsesManualStudentPayments instead */
export function soloTutorUsesManualStudentPayments(profile: ManualStudentPaymentProfileFields | null | undefined): boolean {
  return tutorUsesManualStudentPayments(profile);
}

/** Bank / off-platform payment text from Finance (trimmed). */
export function trimManualPaymentBankDetails(raw: string | null | undefined): string {
  return typeof raw === 'string' ? raw.trim() : '';
}

/** Platform-side flags that imply Tutlio subscription_only–style tier (nebūtinai solo org filtras). */
export function isManualSubscriptionOnlyPlan(profile: {
  subscription_plan?: string | null;
  manual_subscription_exempt?: boolean | null;
} | null | undefined): boolean {
  if (!profile) return false;
  return profile.subscription_plan === 'subscription_only' || profile.manual_subscription_exempt === true;
}
