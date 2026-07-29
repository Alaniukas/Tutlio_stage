import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { wrapInvoiceDescription } from '../../api/_lib/invoicePdf';

describe('wrapInvoiceDescription', () => {
  it('wraps long date lists across lines without truncation', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
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
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const lines = wrapInvoiceDescription('Matematika – 2 pam.', font, 9, 268);
    expect(lines).toEqual(['Matematika – 2 pam.']);
  });
});
