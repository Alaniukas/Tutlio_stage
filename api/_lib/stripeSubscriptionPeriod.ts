/** Tutor plans and enterprise licenses both use the first subscription item. */
export function subscriptionPeriodEndIso(subscription: {
  current_period_end?: unknown;
  items?: { data?: Array<{ current_period_end?: unknown }> };
}): string {
  // Basil moved the period onto items; older signed events still use the root.
  const end = subscription.items?.data?.[0]?.current_period_end ?? subscription.current_period_end;
  if (typeof end !== 'number' || !Number.isFinite(end) || end <= 0) {
    throw new Error('Stripe subscription has no valid billing period end');
  }
  const date = new Date(end * 1000);
  if (!Number.isFinite(date.getTime())) {
    throw new Error('Stripe subscription billing period end is out of range');
  }
  return date.toISOString();
}
