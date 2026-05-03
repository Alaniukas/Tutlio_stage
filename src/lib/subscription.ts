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

/** Fields needed to decide solo tutor student-facing manual (non-Stripe) lesson/package flows. */
export type SoloManualStudentPaymentProfileFields = {
  organization_id?: string | null;
  subscription_plan?: string | null;
  manual_subscription_exempt?: boolean | null;
  enable_manual_student_payments?: boolean | null;
};

/** Solo tutor: rankiniai studentų mokėjimai (subscription_only, admin exempt, arba /admin įjungta vėliava). */
export function soloTutorUsesManualStudentPayments(profile: SoloManualStudentPaymentProfileFields | null | undefined): boolean {
  if (!profile || profile.organization_id) return false;
  return (
    profile.subscription_plan === 'subscription_only' ||
    profile.manual_subscription_exempt === true ||
    profile.enable_manual_student_payments === true
  );
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
