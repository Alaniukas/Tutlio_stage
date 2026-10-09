import { describe, expect, it, vi } from 'vitest';

vi.mock('../../api/_lib/invoicePdf.js', () => ({ generateInvoicePdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])) }));
import { generateInvoicePdf } from '../../api/_lib/invoicePdf.js';
import { correctedManoEmail, correctedManoInvoice, correctedManoPdf } from '../../api/_lib/manoInvoiceCorrection.js';

const batchId = '2f38c792-cfcc-436c-a892-bd9b71a4df1b';
const customer = {
  id: 'customer-id', organization_id: '2c4e4c2a-4e12-44ca-b327-d605bbb0d50b',
  issue_date: '2026-10-06', period_start: '2026-09-01', period_end: '2026-09-30',
  invoice_number: 'MK-1684', status: 'paid', origin: 'internal', total_amount: 80,
  billing_batch_id: batchId, seller_snapshot: { name: 'MB Mano korepetitorius', entityType: 'mb' },
  buyer_snapshot: { name: 'Pavyzdinis klientas' }, pdf_meta: {
    layout: 'pvm_education', notes: ['Mokymo paslaugos'], lessonDetails: [
      { subject: 'Matematika', price: 80, datetime: '2026-09-15 18:00' },
    ],
  },
};
const tutor = {
  ...customer, id: 'tutor-id', status: 'issued', invoice_number: 'SF-001',
  issue_date: '2026-10-08', billing_batch_id: null,
  seller_snapshot: { name: 'Pijus Oželis', entityType: 'individual' },
  pdf_meta: { layout: 'classic_lt_tutor', invoiceKind: 'tutor_pay', issuedByName: 'Pijus Oželis',
    lessonDetails: [{ subject: 'Matematika', price: 80, datetime: '2026-09-15 18:00' }] },
};
const mailOptions = { organizationName: 'Mano korepetitorius', signature: 'Mano korepetitorius komanda',
  recipientName: 'Pavyzdinis klientas', billingBatchId: batchId };

describe('existing MK September invoice correction', () => {
  it('changes customer date while preserving its ID, number, payment state and financial data', () => {
    expect(correctedManoInvoice(customer)).toEqual({ ...customer, issue_date: '2026-09-30' });
    expect(customer.issue_date).toBe('2026-10-06');
  });
  it('changes every tutor number using their saved identity, without changing payment data', () => {
    expect(correctedManoInvoice(tutor)).toEqual({ ...tutor, issue_date: '2026-09-30', invoice_number: 'PIJOŽE-202609' });
    expect(correctedManoInvoice({ ...tutor, seller_snapshot: { ...tutor.seller_snapshot, name: 'Irina Gubacheva' } }).invoice_number)
      .toBe('IRIGUB-202609');
  });
  it.each([
    { organization_id: 'another-organization' }, { period_start: '2026-08-01' },
    { period_end: '2026-10-31' }, { origin: 'external' }, { status: 'cancelled' },
  ])('rejects changes outside the authorized scope: %j', patch => {
    expect(() => correctedManoInvoice({ ...customer, ...patch })).toThrow();
  });
  it('renders the stored financial lines and lesson detail with the corrected date', async () => {
    await correctedManoPdf(customer, [{ description: 'Mokymo paslaugos', quantity: 1, unit_price: 80, total_price: 80 }]);
    expect(generateInvoicePdf).toHaveBeenLastCalledWith(expect.objectContaining({
      issueDate: '2026-09-30', invoiceNumber: 'MK-1684', totalAmount: 80,
      buyer: customer.buyer_snapshot, seller: customer.seller_snapshot,
      lessonDetails: customer.pdf_meta.lessonDetails, notes: customer.pdf_meta.notes,
      lineItems: [{ description: 'Mokymo paslaugos', quantity: 1, unitPrice: 80, totalPrice: 80 }],
    }));
  });
  it('sends paid payers the corrected invoice with no payment link or CTA', () => {
    const result = correctedManoEmail({ ...mailOptions, paid: true });
    expect(result.html).toContain('Nieko papildomai daryti ar mokėti nereikia.');
    expect(result.html).not.toContain('href=');
    expect(result.text).not.toContain('/api/pay-invoice');
    expect(result.paymentLink).toBeUndefined();
  });
  it('sends unpaid payers a stable link for the existing batch', () => {
    const result = correctedManoEmail({ ...mailOptions, paid: false });
    expect(result.paymentLink).toBe('https://tutlio.lt/api/pay-invoice?batch=' + batchId);
    expect(result.html).toContain('Apmokėti sąskaitą');
    expect(result.html).toContain('2026-09-30');
    expect(result.text).toContain(result.paymentLink);
  });
  it('escapes customer and organization names in the mail', () => {
    const result = correctedManoEmail({ ...mailOptions, paid: true, recipientName: '<script>alert(1)</script>' });
    expect(result.html).not.toContain('<script>');
    expect(result.html).toContain('&lt;script&gt;');
  });
});
