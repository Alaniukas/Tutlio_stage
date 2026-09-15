import { describe, expect, it } from 'vitest';
import { orgDashboardMonthMetrics } from '@/lib/orgDashboardMetrics';

describe('orgDashboardMonthMetrics', () => {
  const now = new Date('2026-09-15T12:00:00+03:00');

  it('counts occurred lessons separately from prepaid upcoming ones', () => {
    const metrics = orgDashboardMonthMetrics(
      [
        { status: 'completed', paid: false, payment_status: 'pending', price: 29, end_time: '2026-09-10T10:00:00+03:00' },
        { status: 'completed', paid: true, payment_status: 'paid', price: 29, end_time: '2026-09-11T10:00:00+03:00' },
        { status: 'active', paid: true, payment_status: 'paid', price: 29, end_time: '2026-09-20T10:00:00+03:00' },
        { status: 'active', paid: false, payment_status: 'pending', price: 29, end_time: '2026-09-21T10:00:00+03:00' },
        { status: 'cancelled', paid: true, payment_status: 'paid', price: 29, end_time: '2026-09-09T10:00:00+03:00' },
      ],
      now,
    );

    expect(metrics.occurredCount).toBe(2);
    expect(metrics.plannedCount).toBe(2);
    expect(metrics.paidRevenueEur).toBe(58);
  });

  it('does not treat unpaid completed lessons as cash collected', () => {
    const metrics = orgDashboardMonthMetrics(
      [
        { status: 'completed', paid: false, payment_status: 'pending', price: 380, end_time: '2026-09-10T10:00:00+03:00' },
      ],
      now,
    );
    expect(metrics.occurredCount).toBe(1);
    expect(metrics.paidRevenueEur).toBe(0);
  });

  it('skips complimentary paid sessions from revenue', () => {
    const metrics = orgDashboardMonthMetrics(
      [
        {
          status: 'completed',
          paid: true,
          payment_status: 'paid',
          price: 10,
          is_complimentary: true,
          end_time: '2026-09-10T10:00:00+03:00',
        },
      ],
      now,
    );
    expect(metrics.occurredCount).toBe(1);
    expect(metrics.paidRevenueEur).toBe(0);
  });

  it('keeps transferred payment revenue but excludes its duplicate lesson count', () => {
    const metrics = orgDashboardMonthMetrics(
      [
        {
          status: 'completed',
          paid: true,
          payment_status: 'paid',
          price: 33,
          exclude_from_lesson_count: true,
          end_time: '2026-09-12T14:00:00+03:00',
        },
      ],
      now,
    );

    expect(metrics.occurredCount).toBe(0);
    expect(metrics.paidRevenueEur).toBe(33);
  });
});
