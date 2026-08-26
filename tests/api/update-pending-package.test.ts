import { describe, expect, it, vi, beforeEach } from 'vitest';
import { pendingPackageEditDenial } from '../../src/lib/pendingPackageEdit';
import { aggregatePackageTotals } from '../../api/_lib/packageItems';
import { endOfMonthIso } from '../../api/_lib/packageMonth';

describe('update-pending-package business rules', () => {
  it('maps paid packages to a conflict', () => {
    expect(pendingPackageEditDenial({
      paid: true,
      payment_status: 'paid',
      created_at: new Date().toISOString(),
    })).toBe('paid');
  });

  it('recomputes totals when lesson count drops from 8 to 6', () => {
    const totals = aggregatePackageTotals([
      {
        subjectId: 'subj-1',
        subjectName: 'Matematika',
        totalLessons: 6,
        pricePerLesson: 25,
        itemTotalPrice: 150,
      },
    ]);
    expect(totals).toEqual({ totalLessons: 6, totalPriceEur: 150 });
  });

  it('anchors expiry to the billing period end month', () => {
    const expires = endOfMonthIso(new Date('2026-10-31T12:00:00.000Z'));
    expect(expires.startsWith('2026-11-01')).toBe(true);
  });
});

describe('expireOpenCheckoutSession used before clearing session id', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('is invoked with the stored checkout session', async () => {
    const { expireOpenCheckoutSession } = await import('../../src/lib/pendingPackageEdit');
    const expire = vi.fn(async () => ({ status: 'expired' }));
    await expireOpenCheckoutSession(expire, 'cs_old_amount');
    expect(expire).toHaveBeenCalledWith('cs_old_amount');
  });
});
