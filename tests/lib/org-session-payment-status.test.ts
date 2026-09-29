import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  paymentModel: null as string | null,
  orgAvailable: true,
}));

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    from(table: string) {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({
          data: table === 'students'
            ? { payment_model: state.paymentModel }
            : state.orgAvailable
              ? { enable_per_lesson: false, enable_monthly_billing: true }
              : null,
          error: null,
        }),
      };
      return query;
    },
  },
}));

import { unpaidOrgSessionPaymentStatus } from '../../src/lib/orgSessionPaymentStatus';

describe('org session payment status after undoing payment', () => {
  beforeEach(() => {
    state.paymentModel = null;
    state.orgAvailable = true;
  });

  it('keeps an inherited monthly lesson confirmed', async () => {
    expect(await unpaidOrgSessionPaymentStatus('org-1', 'student-1')).toBe('confirmed');
  });

  it('keeps an explicitly per-lesson student pending', async () => {
    state.paymentModel = 'per_lesson';
    expect(await unpaidOrgSessionPaymentStatus('org-1', 'student-1')).toBe('pending');
  });

  it('fails without billing settings instead of creating a payment demand', async () => {
    state.orgAvailable = false;
    await expect(unpaidOrgSessionPaymentStatus('org-1', 'student-1')).rejects.toThrow();
  });
});
