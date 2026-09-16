import { describe, expect, it } from 'vitest';
import { isSessionActuallyPaid, sessionPaymentDisplayKind } from '@/lib/sessionPaymentDisplay';

describe('sessionPaymentDisplayKind', () => {
  it('does not present monthly confirmed lessons as paid', () => {
    expect(sessionPaymentDisplayKind({ paid: false, payment_status: 'confirmed' })).toBe('reserved');
    expect(isSessionActuallyPaid({ paid: false, payment_status: 'confirmed' })).toBe(false);
  });

  it('shows only actual payment evidence as paid', () => {
    expect(sessionPaymentDisplayKind({ paid: true, payment_status: 'confirmed' })).toBe('paid');
    expect(sessionPaymentDisplayKind({ paid: false, payment_status: 'paid' })).toBe('paid');
    expect(sessionPaymentDisplayKind({ paid: false, payment_status: 'pending' })).toBe('pending');
  });

  it('keeps complimentary lessons distinct from money received', () => {
    expect(sessionPaymentDisplayKind({
      paid: true,
      payment_status: 'paid',
      is_complimentary: true,
    })).toBe('complimentary');
  });
});
