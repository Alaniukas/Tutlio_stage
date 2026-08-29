import { describe, expect, it } from 'vitest';
import { formatInvoiceSeriesHeading, formatStoredInvoiceNumber } from '../../api/_lib/invoiceNumber';
import {
  buildEducationNotes,
  buildLessonDetails,
  groupSessionsByStudent,
  orgHasPvmEducationInvoice,
} from '../../api/_lib/pvmEducationInvoice';
import { generateInvoicePdf } from '../../api/_lib/invoicePdf';

describe('invoice numbering', () => {
  it('stores MK numbers without extra padding', () => {
    expect(formatStoredInvoiceNumber('MK', 1630)).toBe('MK-1630');
    expect(formatStoredInvoiceNumber('mk', 9)).toBe('MK-9');
  });

  it('pads small non-MK series', () => {
    expect(formatStoredInvoiceNumber('SF', 7)).toBe('SF-007');
    expect(formatStoredInvoiceNumber('SF', 1629)).toBe('SF-1629');
  });

  it('formats Serija / Nr heading', () => {
    expect(formatInvoiceSeriesHeading('MK-1629')).toBe('Serija MK Nr. 1629');
    expect(formatInvoiceSeriesHeading('MK-001')).toBe('Serija MK Nr. 1');
  });
});

describe('PVM education invoice content', () => {
  it('detects the org feature', () => {
    expect(orgHasPvmEducationInvoice({ pvm_education_invoice: true })).toBe(true);
    expect(orgHasPvmEducationInvoice({})).toBe(false);
  });

  it('builds notes with Lithuanian diacritics and grade', () => {
    const notes = buildEducationNotes('Aleksas Barabanščikovas', '12 klasė');
    expect(notes[0]).toContain('Barabanščikovas');
    expect(notes[0]).toContain('(12 klasė)');
    expect(notes[1]).toContain('22 straipsniu');
  });

  it('groups one invoice per student', () => {
    const groups = groupSessionsByStudent([
      { student_id: 'a', start_time: '2026-06-02' },
      { student_id: 'b', start_time: '2026-06-03' },
      { student_id: 'a', start_time: '2026-06-09' },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g[0].student_id === 'a')).toHaveLength(2);
  });

  it('builds lesson details with datetime and price', () => {
    const details = buildLessonDetails([
      {
        start_time: '2026-06-09T15:00:00.000Z',
        price: 20,
        subjects: { name: 'Matematika' },
      },
    ]);
    expect(details[0].subject).toBe('Matematika');
    expect(details[0].price).toBe(20);
    expect(details[0].datetime).toMatch(/2026-06-09 \d{2}:\d{2}/);
  });

  it('renders a PVM PDF with Lithuanian characters', async () => {
    const pdf = await generateInvoicePdf({
      invoiceNumber: 'MK-1629',
      invoiceNumberLabel: 'Serija MK Nr. 1629',
      issueDate: '2026 m. birželio 30 d.',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      seller: {
        name: 'MB "Mano korepetitorius"',
        entityType: 'mb',
        companyCode: '305621035',
        vatCode: 'LT100018853316',
        address: 'Žirmūnų g. 100-63, Vilnius',
        bankName: 'Luminor bank AS',
        iban: 'LT574010051005439130',
      },
      buyer: { name: 'Inesa Barabanščikova' },
      lineItems: [{ description: 'Mokymo paslaugos', quantity: 1, unitPrice: 40, totalPrice: 40 }],
      totalAmount: 40,
      layout: 'pvm_education',
      isVatInvoice: true,
      hidePlatformFooter: true,
      notes: buildEducationNotes('Aleksas Barabanščikovas', '12'),
      lessonDetails: [
        { subject: 'Matematika', price: 20, datetime: '2026-06-09 18:00' },
        { subject: 'Matematika', price: 20, datetime: '2026-06-02 18:00' },
      ],
    });
    expect(pdf.byteLength).toBeGreaterThan(2000);
  });
});
