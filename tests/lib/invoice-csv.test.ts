import { describe, it, expect } from 'vitest';
import { csvCell, invoiceAccountingCsv } from '../../src/lib/invoiceCsv';

describe('accounting CSV', () => {
  it('preserves Lithuanian names, quotes, separators and line breaks', () => {
    const csv = invoiceAccountingCsv([{ invoice_number: 'PK-001', issue_date: '2026-09-07',
      buyer_snapshot: { name: 'Živilė; "Mama"\nŠeima' }, total_amount: 12.5, status: 'paid' }]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Živilė; ""Mama""\nŠeima"');
    expect(csv).toContain('"12.50";"12.50";"Apmokėta"');
  });
  it('neutralizes spreadsheet formulas from customer data', () => {
    for (const input of ['=HYPERLINK("https://example.com")', '+123', '-1+2', '@SUM(A1)', ' \t=1+1']) {
      expect(csvCell(input)).toMatch(/^"'/);
    }
  });
  it('keeps cancelled invoices cancelled even if the original payment batch was paid', () => {
    expect(invoiceAccountingCsv([{ invoice_number: 'PK-002', issue_date: '2026-09-07', total_amount: 25,
      status: 'cancelled', billing_batches: { paid: true } }])).toContain('"Atšaukta"');
  });
});
