import { describe, expect, it } from 'vitest';
import {
  buildConsultationFreeLine,
  buildConsultationPaidLine,
  invoiceLinesTotal,
  shouldIssueInvoice,
} from '@/lib/schoolMonthlyInvoiceLines';

describe('schoolMonthlyInvoiceLines', () => {
  it('builds free consultation line at 0 eur', () => {
    const line = buildConsultationFreeLine('Logopedė — konsultacija');
    expect(line.amountEur).toBe(0);
    expect(line.source).toBe('consultation_free');
  });

  it('issues invoice when only free lines exist', () => {
    const lines = [buildConsultationFreeLine('UŠ konsultacija')];
    expect(shouldIssueInvoice(lines)).toBe(true);
    expect(invoiceLinesTotal(lines)).toBe(0);
  });

  it('sums paid help team lines', () => {
    const lines = [buildConsultationPaidLine('Pagalbos komanda', 30, 1)];
    expect(invoiceLinesTotal(lines)).toBe(30);
  });
});
