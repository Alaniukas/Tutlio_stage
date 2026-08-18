import { describe, expect, it } from 'vitest';
import { isSubscriptionOnlyPriceId } from '../../api/_lib/stripe-subscription-env';

describe('subscription-only Stripe price recognition', () => {
  it('recognizes annual no-commission prices through Stripe metadata', () => {
    expect(
      isSubscriptionOnlyPriceId({
        id: 'price_live_or_test_yearly',
        metadata: { plan: 'subscription_only', billing_period: 'yearly' },
      }),
    ).toBe(true);
  });
});
