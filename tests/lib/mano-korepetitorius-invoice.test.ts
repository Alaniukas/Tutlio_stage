import { describe, expect, it } from 'vitest';
import { formatInvoiceSeriesHeading } from '../../api/_lib/invoiceNumber';
import { generateInvoicePdf } from '../../api/_lib/invoicePdf';
import {
  CLASSIC_LT_TUTOR_LAYOUT,
  buildClassicLtTutorPdfMeta,
  classicLtTutorBuyerLines,
  classicLtTutorSellerLines,
  formatClassicLtLessonPrice,
  formatClassicLtSum,
  isManoKorepetitoriusTutorInvoice,
  parseClassicLtTutorPdfMeta,
} from '../../api/_lib/manoKorepetitoriusInvoice';
import { MANO_KOREPETITORIUS_ORG_ID } from '../../src/lib/marketMoney';

describe('Mano Korepetitorius tutor → company invoice', () => {
  it('applies only to that org when the tutor bills the company', () => {
    expect(isManoKorepetitoriusTutorInvoice(true, MANO_KOREPETITORIUS_ORG_ID)).toBe(true);
    expect(isManoKorepetitoriusTutorInvoice(false, MANO_KOREPETITORIUS_ORG_ID)).toBe(false);
    expect(isManoKorepetitoriusTutorInvoice(true, 'proklase')).toBe(false);
  });

  it('uses IRIGUB-style Serija / Nr heading', () => {
    expect(formatInvoiceSeriesHeading('IRIGUB-202607')).toBe('Serija IRIGUB Nr. 202607');
  });

  it('labels seller and buyer like the paper sample', () => {
    expect(
      classicLtTutorSellerLines({
        name: 'Irina Gubačiova',
        activityNumber: '1461510',
        address: 'Veteranų 14-30, Visaginas, LT-31200',
        iban: 'LT237300010157800697',
      }),
    ).toEqual([
      'Vardas, pavardė: Irina Gubačiova',
      'Ind. veiklos Nr.: 1461510',
      'Adresas: Veteranų 14-30, Visaginas, LT-31200',
      'Sąsk. Nr.: LT237300010157800697',
    ]);
    expect(
      classicLtTutorBuyerLines({
        name: 'MB "Mano korepetitorius"',
        companyCode: '305621035',
        vatCode: 'LT100018853316',
        address: 'Žirmūnų g. 100-63, Vilnius',
      }),
    ).toEqual([
      'Pavadinimas: MB "Mano korepetitorius"',
      'Įmonės kodas: 305621035',
      'PVM kodas: LT100018853316',
      'Adresas: Žirmūnų g. 100-63, Vilnius',
    ]);
  });

  it('formats sums and lesson prices like the sample', () => {
    expect(formatClassicLtSum(168)).toBe('168,00');
    expect(formatClassicLtLessonPrice(15)).toBe('15 Eur');
    expect(formatClassicLtLessonPrice(17.5)).toBe('17,50 Eur');
  });

  it('stores lesson extract and issued-by in pdf_meta', () => {
    const meta = buildClassicLtTutorPdfMeta({
      issuedByName: 'Irina Gubačiova',
      lessonPayEur: (s) => Number(s.price) || 0,
      sessions: [
        {
          start_time: '2026-07-07T16:00:00.000Z',
          price: 15,
          subjects: { name: 'Anglų k.' },
        },
        {
          start_time: '2026-07-06T13:00:00.000Z',
          price: 17,
          subjects: { name: 'Matematika' },
        },
      ],
    });
    expect(meta.layout).toBe(CLASSIC_LT_TUTOR_LAYOUT);
    expect(meta.lessonDetails[0].subject).toBe('Matematika');
    expect(meta.issuedByName).toBe('Irina Gubačiova');
    expect(parseClassicLtTutorPdfMeta(meta)?.lessonDetails).toHaveLength(2);
    expect(parseClassicLtTutorPdfMeta({ layout: 'pvm_education' })).toBeNull();
  });

  it('renders a classic tutor PDF without Tutlio footer branding', async () => {
    const pdf = await generateInvoicePdf({
      invoiceNumber: 'IRIGUB-202607',
      invoiceNumberLabel: 'Serija IRIGUB Nr. 202607',
      issueDate: '2026-07-31',
      seller: {
        name: 'Irina Gubačiova',
        entityType: 'individual',
        activityNumber: '1461510',
        address: 'Veteranų 14-30, Visaginas, LT-31200',
        iban: 'LT237300010157800697',
      },
      buyer: {
        name: 'MB "Mano korepetitorius"',
        companyCode: '305621035',
        vatCode: 'LT100018853316',
        address: 'Žirmūnų g. 100-63, Vilnius',
      },
      lineItems: [{ description: 'Mokymo paslaugos', quantity: 1, unitPrice: 168, totalPrice: 168 }],
      totalAmount: 168,
      layout: CLASSIC_LT_TUTOR_LAYOUT,
      hidePlatformFooter: true,
      issuedByName: 'Irina Gubačiova',
      lessonDetails: [
        { subject: 'Anglų k.', price: 15, datetime: '2026-07-07 19:00' },
        { subject: 'Matematika', price: 17, datetime: '2026-07-06 16:00' },
        { subject: 'Matematika', price: 17, datetime: '2026-07-13 16:00' },
        { subject: 'Matematika', price: 17, datetime: '2026-07-20 16:00' },
        { subject: 'Matematika', price: 17, datetime: '2026-07-27 16:00' },
      ],
    });
    expect(pdf.byteLength).toBeGreaterThan(2000);
  });
});
