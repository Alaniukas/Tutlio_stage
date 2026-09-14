import { describe, expect, it } from 'vitest';
import { schoolInstallmentCheckoutCents as clientBreakdown } from '../../src/lib/marketMoney';
import { schoolInstallmentCheckoutCents as serverBreakdown } from '../../api/_lib/marketMoney';

describe('school direct-charge fees', () => {
  it('charges the payer only the list amount and leaves Stripe plus Tutlio 1% to the school', () => {
    const expected = {
      chargeCents: 30_000,
      applicationFeeCents: 300,
      estimatedStripeFeeCents: 475,
      transferToSchoolCents: 29_225,
    };

    expect(clientBreakdown(300, 'default')).toEqual(expected);
    expect(serverBreakdown(300, 'default')).toEqual(expected);
  });
});
