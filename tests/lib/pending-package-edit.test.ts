import { describe, expect, it } from 'vitest';
import {
  canEditPendingPackage,
  expireOpenCheckoutSession,
  pendingPackageEditDenial,
  PENDING_PACKAGE_EDIT_WINDOW_MS,
} from '../../src/lib/pendingPackageEdit';

const now = new Date('2026-08-26T09:00:00.000Z');

describe('pendingPackageEditDenial', () => {
  it('allows a pending unpaid package younger than 7 days', () => {
    expect(pendingPackageEditDenial({
      paid: false,
      payment_status: 'pending',
      created_at: '2026-08-24T09:00:00.000Z',
    }, now)).toBeNull();
    expect(canEditPendingPackage({
      paid: false,
      payment_status: 'pending',
      created_at: '2026-08-24T09:00:00.000Z',
    }, now)).toBe(true);
  });

  it('blocks paid, cancelled, expired, and stale packages', () => {
    expect(pendingPackageEditDenial({ paid: true, payment_status: 'pending', created_at: now.toISOString() }, now)).toBe('paid');
    expect(pendingPackageEditDenial({ paid: false, payment_status: 'paid', created_at: now.toISOString() }, now)).toBe('paid');
    expect(pendingPackageEditDenial({ paid: false, payment_status: 'cancelled', created_at: now.toISOString() }, now)).toBe('cancelled');
    expect(pendingPackageEditDenial({ paid: false, payment_status: 'expired', created_at: now.toISOString() }, now)).toBe('expired');
    const stale = new Date(now.getTime() - PENDING_PACKAGE_EDIT_WINDOW_MS - 60_000).toISOString();
    expect(pendingPackageEditDenial({ paid: false, payment_status: 'pending', created_at: stale }, now)).toBe('too_old');
  });
});

describe('expireOpenCheckoutSession', () => {
  it('expires a stored Stripe session id and ignores missing ids', async () => {
    const expire = async (id: string) => {
      if (id !== 'cs_test') throw new Error('unexpected');
      return { id };
    };
    expect(await expireOpenCheckoutSession(expire, 'cs_test')).toBe(true);
    expect(await expireOpenCheckoutSession(expire, null)).toBe(false);
    expect(await expireOpenCheckoutSession(async () => { throw new Error('already expired'); }, 'cs_old')).toBe(false);
  });
});
