import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  amountInLithuanianWords,
  generateSchoolMonthlyInvoicePdf,
  resolveLaisviVaikaiInvoiceLogoPath,
} from '../../api/_lib/schoolMonthlyInvoicePdf';

describe('Laisvi vaikai monthly invoice PDF', () => {
  it('spells the payable amount and cents in Lithuanian', () => {
    expect(amountInLithuanianWords(36)).toBe('trisdešimt šeši eurai 00 ct');
    expect(amountInLithuanianWords(11.25)).toBe('vienuolika eurų 25 ct');
  });

  it('uses the bundled watercolor logo extracted from the supplied PAM template', () => {
    expect(resolveLaisviVaikaiInvoiceLogoPath()).toContain('laisvi-vaikai-invoice-logo.png');
    expect(existsSync(resolveLaisviVaikaiInvoiceLogoPath())).toBe(true);
  });

  it('renders a preview PDF with the original, discount and payable amounts', async () => {
    const bytes = await generateSchoolMonthlyInvoicePdf({
      preview: true,
      invoiceNumber: 'PAM-PERŽIŪRA',
      issueDate: '2026-09-17',
      periodLabel: 'rugsėjis 2026',
      studentName: 'Jonas Jonaitis',
      seller: { name: 'VšĮ „Laisvi vaikai“' },
      buyer: { name: 'Jonas Jonaitis mokėtojas' },
      lines: [{
        studentName: 'Jonas Jonaitis', activity: 'Matematika', quantity: 8,
        unitPriceEur: 6, originalAmountEur: 48, discountLabel: '25 %',
        discountAmountEur: 12, amountEur: 36,
      }],
      subtotalEur: 48,
      discountAmountEur: 12,
      totalEur: 36,
    });
    expect(bytes.byteLength).toBeGreaterThan(10_000);
    expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe('%PDF');
  });
});
