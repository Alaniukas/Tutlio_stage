import { describe, expect, it } from 'vitest';
import {
  buildSchoolLessonInvoiceLines,
  buildConsultationFreeLine,
  buildConsultationPaidLine,
  invoiceLineDiscount,
  invoiceLinesDiscountTotal,
  invoiceLinesSubtotal,
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

  it('keeps the original amount visible when a percentage discount is applied', () => {
    const lines = buildSchoolLessonInvoiceLines([
      { id: 'l1', subjectId: 'lt', subjectName: 'Lietuvių k.', tutorId: 't1', tutorName: 'Alina', unitPriceEur: 6 },
      { id: 'l2', subjectId: 'lt', subjectName: 'Lietuvių k.', tutorId: 't1', tutorName: 'Alina', unitPriceEur: 6 },
      { id: 'l3', subjectId: 'lt', subjectName: 'Lietuvių k.', tutorId: 't1', tutorName: 'Alina', unitPriceEur: 6 },
    ], [{ type: 'percent', value: 100, subjectId: 'lt', note: 'Visų mokslo metų nuolaida' }]);

    expect(lines[0]).toMatchObject({
      quantity: 3,
      unitPriceEur: 6,
      originalAmountEur: 18,
      discountAmountEur: 18,
      amountEur: 0,
      discountType: 'percent',
      discountValue: 100,
    });
    expect(invoiceLinesSubtotal(lines)).toBe(18);
    expect(invoiceLinesDiscountTotal(lines)).toBe(18);
    expect(invoiceLinesTotal(lines)).toBe(0);
  });

  it('caps a fixed discount at the original row amount', () => {
    expect(invoiceLineDiscount(12, { type: 'amount', value: 20 })).toEqual({
      discountAmountEur: 12,
      amountEur: 0,
      label: '12,00 €',
    });
  });

  it('groups only equal activity, teacher and unit price combinations', () => {
    const lines = buildSchoolLessonInvoiceLines([
      { id: 'a', subjectId: 'en', subjectName: 'Anglų k.', tutorId: 'g', tutorName: 'Gintaras', unitPriceEur: 6 },
      { id: 'b', subjectId: 'en', subjectName: 'Anglų k.', tutorId: 'g', tutorName: 'Gintaras', unitPriceEur: 6 },
      { id: 'c', subjectId: 'en', subjectName: 'Anglų k.', tutorId: 'g', tutorName: 'Gintaras', unitPriceEur: 8 },
    ]);
    expect(lines.map((line) => [line.quantity, line.unitPriceEur, line.amountEur])).toEqual([
      [2, 6, 12],
      [1, 8, 8],
    ]);
  });
});
