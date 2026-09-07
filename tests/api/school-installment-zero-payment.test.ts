import { describe, expect, it } from 'vitest';
import { schoolInstallmentChargeEur } from '../../api/_lib/schoolBookingInvite';

describe('schoolInstallmentChargeEur', () => {
  it('returns base amount for later installments', () => {
    expect(schoolInstallmentChargeEur({ installment_number: 2, amount: 100 }, { additional_fee_amount: 25 })).toBe(100);
  });

  it('adds additional fee only on first installment', () => {
    expect(schoolInstallmentChargeEur({ installment_number: 1, amount: 300 }, { additional_fee_amount: 25 })).toBe(325);
  });

  it('returns zero for free contracts', () => {
    expect(schoolInstallmentChargeEur({ installment_number: 1, amount: 0 }, { additional_fee_amount: 0 })).toBe(0);
  });
});
