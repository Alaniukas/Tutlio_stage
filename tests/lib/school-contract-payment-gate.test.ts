import { describe, expect, it } from 'vitest';
import { schoolContractAllowsInstallmentPayment } from '../../api/_lib/schoolContractPaymentGate';

describe('schoolContractAllowsInstallmentPayment', () => {
  it('allows payment only when contract is fully signed', () => {
    expect(schoolContractAllowsInstallmentPayment('signed')).toBe(true);
  });

  it('blocks payment for all non-signed statuses', () => {
    for (const status of ['draft', 'sent', 'awaiting_school_signature', 'signed_by_school', '']) {
      expect(schoolContractAllowsInstallmentPayment(status)).toBe(false);
    }
    expect(schoolContractAllowsInstallmentPayment(null)).toBe(false);
    expect(schoolContractAllowsInstallmentPayment(undefined)).toBe(false);
  });
});
