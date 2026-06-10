// Billing & receipts automation units:
// checkout breakdown math, B2C month aggregation, B2B invoice line items.
import { describe, expect, it } from 'vitest';
import { lessonStripeBreakdownEur, customerTotalEur } from '../../src/lib/stripeLessonPricing';
import { lessonCheckoutBreakdownCents } from '../../api/_lib/stripeLessonPricing';
import { monthRangeUtc, summarizeB2cMonth, b2cSummaryCsv } from '../../api/_lib/b2cReport';
import { buildB2bInvoiceLines, lithuanianMonthLabel } from '../../api/_lib/b2bInvoice';

describe('lesson Stripe breakdown (client/server parity)', () => {
  it('splits a €20 lesson into base + fee that sum to the checkout total', () => {
    const b = lessonStripeBreakdownEur(20);
    expect(b.base).toBe(20);
    expect(b.fee).toBeCloseTo(0.96, 2);
    expect(b.total).toBeCloseTo(20.96, 2);
    expect(Math.round((b.base + b.fee) * 100)).toBe(Math.round(b.total * 100));
    expect(b.total).toBeCloseTo(Math.round(customerTotalEur(20) * 100) / 100, 2);
  });

  it('matches the server-side cents breakdown across a price sweep', () => {
    for (const price of [5, 9.99, 12.5, 20, 33.33, 45, 80, 120.75]) {
      const client = lessonStripeBreakdownEur(price);
      const server = lessonCheckoutBreakdownCents(price);
      expect(Math.round(client.base * 100)).toBe(server.baseCents);
      expect(Math.round(client.fee * 100)).toBe(server.feesCents);
      expect(Math.round(client.total * 100)).toBe(server.totalCents);
      expect(server.baseCents + server.feesCents).toBe(server.totalCents);
    }
  });
});

describe('B2C monthly summary', () => {
  it('parses a month into a UTC [start, end) range', () => {
    const r = monthRangeUtc('2026-05');
    expect(r).toEqual({
      startIso: '2026-05-01T00:00:00.000Z',
      endIso: '2026-06-01T00:00:00.000Z',
    });
    expect(monthRangeUtc('2026-13')).toBeNull();
    expect(monthRangeUtc('garbage')).toBeNull();
    expect(monthRangeUtc('')).toBeNull();
  });

  it('aggregates a mixed Stripe/Perlas month', () => {
    const s = summarizeB2cMonth({
      month: '2026-05',
      stripeRows: [
        { platform_fee: 0.96, gross_amount: 20.96 },
        { platform_fee: '1.04', gross_amount: '30.04' }, // numeric columns may come back as strings
      ],
      perlasRows: [
        { platform_fee: 0.4, perlas_fee: 0.2, volume: 20.6 },
        { platform_fee: '0.6', perlas_fee: '0.3', volume: '30.9' },
      ],
    });
    expect(s.stripe).toEqual({ operations: 2, feesEur: 2.0, grossEur: 51.0 });
    expect(s.perlas.operations).toBe(2);
    expect(s.perlas.feesEur).toBeCloseTo(1.5, 2);
    expect(s.perlas.grossEur).toBeCloseTo(51.5, 2);
    expect(s.totalOperations).toBe(4);
    expect(s.totalFeesEur).toBeCloseTo(3.5, 2);
  });

  it('handles an empty month without NaN', () => {
    const s = summarizeB2cMonth({ month: '2026-04', stripeRows: [], perlasRows: [] });
    expect(s.totalOperations).toBe(0);
    expect(s.totalFeesEur).toBe(0);
  });

  it('renders the CSV with per-provider and total rows', () => {
    const s = summarizeB2cMonth({
      month: '2026-05',
      stripeRows: [{ platform_fee: 1, gross_amount: 21 }],
      perlasRows: [{ platform_fee: 0.5, perlas_fee: 0.25, volume: 20.75 }],
    });
    const csv = b2cSummaryCsv(s);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Laikotarpis,Teikejas,Operaciju skaicius');
    expect(csv).toContain('2026-05,Stripe,1,1.00,21.00');
    expect(csv).toContain('2026-05,Perlas Finance,1,0.75,20.75');
    expect(csv).toContain('2026-05,Is viso,2,1.75,41.75');
  });
});

describe('B2B invoice line items', () => {
  it('builds subscription + grouped payout fees with deducted and due amounts', () => {
    const lines = buildB2bInvoiceLines({
      month: '2026-05',
      subscriptionEur: 49,
      payoutFees: [1.5, 1.5, 1.5],
    });
    expect(lines.lineItems).toHaveLength(2);
    expect(lines.lineItems[0]).toEqual({
      description: 'Tutlio platformos abonementas (2026 m. gegužė)',
      quantity: 1,
      unitPrice: 49,
      totalPrice: 49,
    });
    expect(lines.lineItems[1]).toEqual({
      description: 'Išmokėjimų pavedimų mokesčiai (3 vnt.)',
      quantity: 3,
      unitPrice: 1.5,
      totalPrice: 4.5,
    });
    expect(lines.totalAmount).toBe(53.5);
    expect(lines.deductedAmount).toBe(4.5);
    expect(lines.amountDue).toBe(49);
  });

  it('groups payout fees by amount when the fee setting changed mid-month', () => {
    const lines = buildB2bInvoiceLines({
      month: '2026-05',
      subscriptionEur: 49,
      payoutFees: [1.5, 2, 1.5],
    });
    expect(lines.lineItems).toHaveLength(3);
    expect(lines.lineItems[1]).toMatchObject({ quantity: 2, unitPrice: 1.5, totalPrice: 3 });
    expect(lines.lineItems[2]).toMatchObject({ quantity: 1, unitPrice: 2, totalPrice: 2 });
    expect(lines.totalAmount).toBe(54);
    expect(lines.deductedAmount).toBe(5);
    expect(lines.amountDue).toBe(49);
  });

  it('returns subscription-only invoice when there were no payouts', () => {
    const lines = buildB2bInvoiceLines({ month: '2026-02', subscriptionEur: 49, payoutFees: [] });
    expect(lines.lineItems).toHaveLength(1);
    expect(lines.totalAmount).toBe(49);
    expect(lines.deductedAmount).toBe(0);
    expect(lines.amountDue).toBe(49);
  });

  it('ignores zero/negative payout fee rows', () => {
    const lines = buildB2bInvoiceLines({ month: '2026-05', subscriptionEur: 30, payoutFees: [0, -1, 1.5] });
    expect(lines.lineItems).toHaveLength(2);
    expect(lines.deductedAmount).toBe(1.5);
    expect(lines.totalAmount).toBe(31.5);
  });

  it('labels the period with the Lithuanian month name', () => {
    expect(lithuanianMonthLabel('2026-01')).toBe('2026 m. sausis');
    expect(lithuanianMonthLabel('2026-12')).toBe('2026 m. gruodis');
    expect(lithuanianMonthLabel('not-a-month')).toBe('not-a-month');
  });
});
