// Billing & receipts automation units:
// checkout breakdown math, B2C month aggregation, B2B invoice line items.
import { describe, expect, it } from 'vitest';
import { lessonStripeBreakdownEur, customerTotalEur } from '../../src/lib/stripeLessonPricing';
import { lessonCheckoutBreakdownCents } from '../../api/_lib/stripeLessonPricing';
import {
  monthRangeUtc,
  summarizeB2cMonth,
  b2cSummaryCsv,
  monthPeriodDates,
} from '../../api/_lib/b2cReport';
import { buildB2bInvoiceLines, lithuanianMonthLabel } from '../../api/_lib/b2bInvoice';
import {
  groupB2cFeesByCounterparty,
  buildB2cCommissionLines,
  formatB2cInvoiceNumber,
} from '../../api/_lib/b2cCommissionInvoice';

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

describe('B2C commission invoices (per-client sąskaitos faktūros)', () => {
  it('computes the calendar period of the month', () => {
    expect(monthPeriodDates('2026-06')).toEqual({ periodStart: '2026-06-01', periodEnd: '2026-06-30' });
    expect(monthPeriodDates('2026-02')).toEqual({ periodStart: '2026-02-01', periodEnd: '2026-02-28' });
    expect(monthPeriodDates('2028-02')).toEqual({ periodStart: '2028-02-01', periodEnd: '2028-02-29' });
    expect(monthPeriodDates('garbage')).toBeNull();
  });

  it('groups Stripe and Perlas fees by counterparty (org takes precedence over tutor)', () => {
    const { counterparties, unattributedOperations } = groupB2cFeesByCounterparty({
      stripeRows: [
        { organization_id: null, tutor_id: 't1', platform_fee: 0.96 },
        { organization_id: null, tutor_id: 't1', platform_fee: '1.04' },
        { organization_id: 'o1', tutor_id: 't2', platform_fee: 2 },
        { organization_id: null, tutor_id: null, platform_fee: 0.5 }, // unattributed
        { organization_id: null, tutor_id: 't1', platform_fee: 0 },   // zero fee — ignored
      ],
      perlasRows: [
        { entity_type: 'tutor', entity_id: 't1', platform_fee: 0.5, perlas_fee: 0.18 },
        { entity_type: 'org', entity_id: 'o1', platform_fee: 1, perlas_fee: 0.18 },
      ],
    });

    expect(unattributedOperations).toBe(1);
    expect(counterparties).toHaveLength(2);

    const t1 = counterparties.find((c) => c.counterpartyId === 't1')!;
    expect(t1.counterpartyType).toBe('tutor');
    expect(t1.stripeOperations).toBe(2);
    expect(t1.stripeFeesEur).toBeCloseTo(2.0, 2);
    expect(t1.perlasOperations).toBe(1);
    expect(t1.perlasFeesEur).toBeCloseTo(0.68, 2);

    const o1 = counterparties.find((c) => c.counterpartyId === 'o1')!;
    expect(o1.counterpartyType).toBe('org');
    expect(o1.stripeFeesEur).toBe(2);
    expect(o1.perlasFeesEur).toBeCloseTo(1.18, 2);
  });

  it('builds a single simple paid line: "Tutlio tarpininkavimo mokesčiai (mėnuo)"', () => {
    const lines = buildB2cCommissionLines({
      month: '2026-06',
      fees: { stripeFeesEur: 2.0, perlasFeesEur: 0.68 },
    });
    expect(lines.lineItems).toHaveLength(1);
    expect(lines.lineItems[0]).toEqual({
      description: 'Tutlio tarpininkavimo mokesčiai (2026 m. birželis)',
      quantity: 1,
      unitPrice: 2.68,
      totalPrice: 2.68,
    });
    expect(lines.totalAmount).toBeCloseTo(2.68, 2);
    // Issued as paid: the fee was already deducted at settlement.
    expect(lines.deductedAmount).toBeCloseTo(2.68, 2);
    expect(lines.amountDue).toBe(0);
  });

  it('formats the B2C number series separately from B2B', () => {
    expect(formatB2cInvoiceNumber(1)).toBe('TUT-B2C-00001');
    expect(formatB2cInvoiceNumber(123)).toBe('TUT-B2C-00123');
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
