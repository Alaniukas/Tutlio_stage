import { describe, expect, it } from 'vitest';
import {
  isOverdueUnpaidPooledPackage,
  isPayableUnpaidPooledPackage,
  reactivateUnpaidPooledPackageUpdate,
} from '../../src/lib/pooledPackageOverdue';

const pooled = '3422031d-6e21-424d-980b-35a9c6d7b8f1';

describe('pooledPackageOverdue', () => {
  it('treats unpaid pooled packages past billing month as overdue', () => {
    const now = new Date('2026-10-06T12:00:00Z');
    expect(isOverdueUnpaidPooledPackage({
      pool_organization_id: pooled,
      paid: false,
      payment_status: 'pending',
      billing_period_end: '2026-09-30',
    }, now)).toBe(true);
  });

  it('keeps current-month pending packages out of overdue', () => {
    const now = new Date('2026-10-06T12:00:00Z');
    expect(isOverdueUnpaidPooledPackage({
      pool_organization_id: pooled,
      paid: false,
      payment_status: 'pending',
      billing_period_end: '2026-10-31',
    }, now)).toBe(false);
  });

  it('still flags legacy cron-expired pending rows as overdue', () => {
    expect(isOverdueUnpaidPooledPackage({
      pool_organization_id: pooled,
      paid: false,
      payment_status: 'expired',
      billing_period_end: '2026-09-30',
    })).toBe(true);
  });

  it('does not treat paid or cancelled packages as payable debt', () => {
    expect(isPayableUnpaidPooledPackage({ pool_organization_id: pooled, paid: true, payment_status: 'paid' })).toBe(false);
    expect(isPayableUnpaidPooledPackage({ pool_organization_id: pooled, paid: false, payment_status: 'cancelled' })).toBe(false);
    expect(isPayableUnpaidPooledPackage({ pool_organization_id: pooled, paid: false, payment_status: 'pending' })).toBe(true);
  });

  it('reactivation patch restores payable pending state', () => {
    expect(reactivateUnpaidPooledPackageUpdate()).toEqual({ active: true, payment_status: 'pending', expires_at: null });
  });
});
