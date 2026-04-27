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

/** "Subscription only" plan = manual payments workflow, no Stripe Connect required. */
export function isManualSubscriptionOnlyPlan(profile: {
  subscription_plan?: string | null;
  manual_subscription_exempt?: boolean | null;
} | null | undefined): boolean {
  if (!profile) return false;
  return profile.subscription_plan === 'subscription_only' || profile.manual_subscription_exempt === true;
}
