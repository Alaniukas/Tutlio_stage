import { describe, expect, it } from 'vitest';
import { subscriptionPeriodEndIso } from '../../api/_lib/stripeSubscriptionPeriod';

describe('subscription billing periods across Stripe API versions', () => {
  const end = 1790000000;
  it('accepts old signed events with a root period', () => {
    expect(subscriptionPeriodEndIso({ current_period_end: end })).toBe(new Date(end * 1000).toISOString());
  });
  it('uses the billed first item on Basil events, not a different add-on period', () => {
    expect(subscriptionPeriodEndIso({ items: { data: [{ current_period_end: end }, { current_period_end: end + 100 }] } }))
      .toBe(new Date(end * 1000).toISOString());
  });
  it.each([undefined, null, 0, -1, NaN, Infinity, 1e20, '1790000000'])('rejects invalid period %s instead of granting access', (value) => {
    expect(() => subscriptionPeriodEndIso({ current_period_end: value })).toThrow(/period end/);
  });
});
