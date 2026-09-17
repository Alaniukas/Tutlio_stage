import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateSchoolDiscountAgreementPdf } from '../../api/_lib/schoolDiscountAgreementPdf';
import { resolveLaisviVaikaiInvoiceLogoPath } from '../../api/_lib/schoolMonthlyInvoicePdf';

describe('school discount agreement PDF', () => {
  it('uses the supplied Laisvi vaikai logo and renders the addendum', async () => {
    expect(existsSync(resolveLaisviVaikaiInvoiceLogoPath())).toBe(true);
    const bytes = await generateSchoolDiscountAgreementPdf({
      agreementNumber: 'NPR-1', contractNumber: 'LV-1', issueDate: '2026-09-17',
      acceptedAt: '2026-09-17 14:32', schoolName: 'VšĮ „Laisvi vaikai“',
      parentName: 'Tėvas', parentEmail: 'tevas@example.com', studentName: 'Jonas Jonaitis',
      activityLabel: 'Matematika 8 kl.', discountType: 'percent', discountValue: 25,
      validFrom: '2026-09-01', validUntil: '2027-06-30', acceptanceStatement: 'Sutinku.',
    });
    expect(bytes.byteLength).toBeGreaterThan(10_000);
    expect(Buffer.from(bytes).subarray(0, 4).toString()).toBe('%PDF');
  });
});
