import { describe, expect, it } from 'vitest';
import {
  isSplitContractFeeInstallment,
  SPLIT_CONTRACT_FEE_DUE,
  SPLIT_CONTRACT_FEE_EUR,
} from '../../api/_lib/schoolBookingInvite';

describe('isSplitContractFeeInstallment', () => {
  const allInstallments = [
    { installment_number: 1 },
    { installment_number: 2 },
  ];

  it('detects migrated 50€ fee row', () => {
    expect(
      isSplitContractFeeInstallment(
        { installment_number: 1, amount: SPLIT_CONTRACT_FEE_EUR, due_date: SPLIT_CONTRACT_FEE_DUE },
        { additional_fee_amount: null },
        allInstallments,
      ),
    ).toBe(true);
  });

  it('rejects bundled first installment with additional_fee on contract', () => {
    expect(
      isSplitContractFeeInstallment(
        { installment_number: 1, amount: 300, due_date: '2026-07-23' },
        { additional_fee_amount: 50 },
        allInstallments,
      ),
    ).toBe(false);
  });

  it('rejects annual installment #2', () => {
    expect(
      isSplitContractFeeInstallment(
        { installment_number: 2, amount: 250, due_date: '2026-07-23' },
        { additional_fee_amount: null },
        allInstallments,
      ),
    ).toBe(false);
  });

  it('rejects fee row when no later installments exist', () => {
    expect(
      isSplitContractFeeInstallment(
        { installment_number: 1, amount: SPLIT_CONTRACT_FEE_EUR, due_date: SPLIT_CONTRACT_FEE_DUE },
        { additional_fee_amount: null },
        [{ installment_number: 1 }],
      ),
    ).toBe(false);
  });
});
