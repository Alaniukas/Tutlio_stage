import { describe, expect, it } from 'vitest';
import {
  billingBatchWasPaid,
  sessionReleaseUpdate,
} from '../../api/_lib/releaseInvoiceBilling';

describe('releaseInvoiceBilling helpers', () => {
  it('detects paid billing batches', () => {
    expect(billingBatchWasPaid({ paid: true, payment_status: 'pending' })).toBe(true);
    expect(billingBatchWasPaid({ paid: false, payment_status: 'paid' })).toBe(true);
    expect(billingBatchWasPaid({ paid: false, payment_status: 'pending' })).toBe(false);
    expect(billingBatchWasPaid(null)).toBe(false);
  });

  it('clears only batch link for unpaid monthly invoices', () => {
    expect(sessionReleaseUpdate(false)).toEqual({ payment_batch_id: null });
  });

  it('clears paid flags when voiding a paid monthly invoice', () => {
    expect(sessionReleaseUpdate(true)).toEqual({
      payment_batch_id: null,
      paid: false,
      payment_status: 'pending',
    });
  });
});
