import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument } from 'pdf-lib';
import {
  generateInvoicePdf,
  resolveInvoiceFontPath,
  wrapInvoiceDescription,
} from '../../api/_lib/invoicePdf';

async function embedNoto() {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const bytes = new Uint8Array(readFileSync(resolveInvoiceFontPath('regular')));
  return doc.embedFont(bytes);
}

describe('invoice font packaging', () => {
  it('resolves Noto Sans regular and bold from api/_lib/fonts', () => {
    expect(resolveInvoiceFontPath('regular')).toContain('NotoSans-Regular.ttf');
    expect(resolveInvoiceFontPath('bold')).toContain('NotoSans-Bold.ttf');
    expect(existsSync(resolveInvoiceFontPath('regular'))).toBe(true);
    expect(existsSync(resolveInvoiceFontPath('bold'))).toBe(true);
  });
});

describe('wrapInvoiceDescription', () => {
  it('wraps long date lists across lines without truncation', async () => {
    const font = await embedNoto();
    const text =
      'Matematika – Lukas Petraitis – 4 pam.\n(07-03, 07-10, 07-17, 07-24, 07-31, 08-07, 08-14)';
    const lines = wrapInvoiceDescription(text, font, 9, 268);
    expect(lines.length).toBeGreaterThan(1);
    const joined = lines.join(' ');
    expect(joined).toContain('07-03');
    expect(joined).toContain('08-14');
    expect(joined).not.toContain('...');
  });

  it('keeps short descriptions on one line', async () => {
    const font = await embedNoto();
    const lines = wrapInvoiceDescription('Matematika – 2 pam.', font, 9, 268);
    expect(lines).toEqual(['Matematika – 2 pam.']);
  });

  it('measures Lithuanian diacritics without stripping', async () => {
    const font = await embedNoto();
    const lines = wrapInvoiceDescription('Sąskaita faktūra – aprašymas', font, 9, 268);
    expect(lines.join(' ')).toContain('Sąskaita');
    expect(lines.join(' ')).toContain('aprašymas');
  });
});

describe('generateInvoicePdf', () => {
  it('renders a PDF with Unicode invoice labels', async () => {
    const pdf = await generateInvoicePdf({
      invoiceNumber: 'SF-TEST-001',
      issueDate: '2026-08-09',
      seller: { name: 'UAB Pavyzdys', entityType: 'company', companyCode: '123456789' },
      buyer: { name: 'Jonas Petraitis' },
      lineItems: [{ description: 'Matematika – 2 pam.', quantity: 2, unitPrice: 25, totalPrice: 50 }],
      totalAmount: 50,
    });
    expect(pdf.byteLength).toBeGreaterThan(1000);
  });
});
