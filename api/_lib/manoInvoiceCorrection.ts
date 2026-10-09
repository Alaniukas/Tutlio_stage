import assert from 'node:assert/strict';
import { MANO_KOREPETITORIUS_ORG_ID } from './marketMoney.js';
import { generateInvoicePdf, type InvoicePdfData, type InvoicePdfBranding } from './invoicePdf.js';
import { formatInvoiceSeriesHeading } from './invoiceNumber.js';
import { parsePvmPdfMeta } from './pvmEducationInvoice.js';
import {
  manoTutorMonthlyInvoiceNumber,
  monthlyInvoiceIssueDate,
  parseClassicLtTutorPdfMeta,
} from './manoKorepetitoriusInvoice.js';
import { outlookEmailButton } from './outlookEmail.js';

export const MANO_SEPTEMBER_CORRECTION = 'mano-202609-invoice-date-v1';
export const CORRECTION_META_KEY = 'manoSeptemberDateCorrection';

export function correctedManoInvoice(invoice: any): any {
  assert.equal(invoice.organization_id, MANO_KOREPETITORIUS_ORG_ID);
  assert.equal(invoice.period_start, '2026-09-01');
  assert.equal(invoice.period_end, '2026-09-30');
  assert.notEqual(invoice.origin, 'external');
  assert(['issued', 'paid'].includes(invoice.status), 'Only issued/paid invoices can be corrected');
  const tutor = invoice.pdf_meta?.invoiceKind === 'tutor_pay';
  assert(tutor ? parseClassicLtTutorPdfMeta(invoice.pdf_meta) : parsePvmPdfMeta(invoice.pdf_meta));
  return {
    ...invoice,
    issue_date: monthlyInvoiceIssueDate(invoice.organization_id, invoice.period_end),
    invoice_number: tutor
      ? manoTutorMonthlyInvoiceNumber(invoice.seller_snapshot.name, invoice.period_end)
      : invoice.invoice_number,
  };
}

export async function correctedManoPdf(invoice: any, items: any[], branding?: InvoicePdfBranding | null) {
  const corrected = correctedManoInvoice(invoice);
  const classic = parseClassicLtTutorPdfMeta(corrected.pdf_meta);
  const pvm = parsePvmPdfMeta(corrected.pdf_meta);
  const data: InvoicePdfData = {
    invoiceNumber: corrected.invoice_number,
    invoiceNumberLabel: formatInvoiceSeriesHeading(corrected.invoice_number),
    issueDate: corrected.issue_date,
    periodStart: corrected.period_start,
    periodEnd: corrected.period_end,
    seller: corrected.seller_snapshot,
    buyer: corrected.buyer_snapshot,
    lineItems: items.map(item => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
      totalPrice: Number(item.total_price),
    })),
    totalAmount: Number(corrected.total_amount),
    currency: corrected.pdf_meta?.currency === 'PLN' ? 'PLN' : 'EUR',
    branding: classic ? undefined : branding ?? undefined,
    isVatInvoice: Boolean(pvm || corrected.seller_snapshot.vatCode),
    hidePlatformFooter: true,
    ...(classic ? {
      layout: 'classic_lt_tutor' as const,
      lessonDetails: classic.lessonDetails,
      issuedByName: classic.issuedByName,
    } : {
      layout: 'pvm_education' as const,
      notes: pvm!.notes,
      lessonDetails: pvm!.lessonDetails,
    }),
  };
  return { invoice: corrected, data, bytes: await generateInvoicePdf(data) };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function correctedManoEmail(opts: {
  organizationName: string;
  signature: string;
  recipientName: string;
  paid: boolean;
  billingBatchId: string;
  contactEmail?: string;
  brandColor?: string;
}) {
  assert(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(opts.billingBatchId));
  const paymentLink = opts.paid ? undefined : 'https://tutlio.lt/api/pay-invoice?batch=' + opts.billingBatchId;
  const correction = 'Siunčiame pataisytą sąskaitą faktūrą už 2026 m. rugsėjo mėnesio pamokas. Išrašymo data pataisyta į 2026-09-30. Sąskaitos numeris ir suma nepasikeitė.';
  const instruction = opts.paid
    ? 'Šią sąskaitą jau apmokėjote. Nieko papildomai daryti ar mokėti nereikia.'
    : 'Prašome apmokėti sąskaitą paspaudus žemiau esantį mokėjimo mygtuką.';
  const greeting = opts.recipientName ? 'Sveiki, ' + opts.recipientName + ',' : 'Sveiki,';
  const color = /^#[0-9a-f]{6}$/i.test(opts.brandColor || '') ? opts.brandColor! : '#4f46e5';
  const button = paymentLink
    ? '<div style="margin:28px 0;">' + outlookEmailButton(escapeHtml(paymentLink), 'Apmokėti sąskaitą', color) + '</div>'
    : '';
  const html = '<!doctype html><html lang="lt"><head><meta charset="utf-8"></head>'
    + '<body style="margin:0;background:#f5f6fa;font-family:Arial,sans-serif;color:#1f2937;">'
    + '<div style="max-width:600px;margin:24px auto;background:white;border-radius:12px;overflow:hidden;">'
    + '<div style="padding:24px;background:' + color + ';color:white;font-size:22px;font-weight:700;">'
    + escapeHtml(opts.organizationName) + '</div><div style="padding:28px;font-size:15px;line-height:1.7;">'
    + '<p>' + escapeHtml(greeting) + '</p><p>' + escapeHtml(correction) + '</p>'
    + '<p><strong>' + escapeHtml(instruction) + '</strong></p>' + button
    + '<p>Prašome savo dokumentuose naudoti prie šio laiško pridėtą pataisytą sąskaitą faktūrą.</p>'
    + '<p>Atsiprašome už netikslią datą ankstesnėje sąskaitoje.</p>'
    + '<p>Pagarbiai,<br>' + escapeHtml(opts.signature) + '</p>'
    + (opts.contactEmail ? '<p style="font-size:13px;color:#6b7280;">Kilus klausimų: '
      + escapeHtml(opts.contactEmail) + '</p>' : '') + '</div></div></body></html>';
  return {
    subject: opts.organizationName + ' | Pataisyta rugsėjo sąskaita faktūra',
    html,
    text: [greeting, correction, instruction, paymentLink,
      'Prašome savo dokumentuose naudoti pridėtą pataisytą sąskaitą faktūrą.',
      'Atsiprašome už netikslią datą ankstesnėje sąskaitoje.', opts.signature,
      opts.contactEmail].filter(Boolean).join('\n\n'),
    paymentLink,
  };
}
