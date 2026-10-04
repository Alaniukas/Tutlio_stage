import { describe, expect, it } from 'vitest';
import {
  formatSchoolInvoiceNumberLabel,
  formatStoredInvoiceNumber,
  previewInvoiceNumber,
} from '../../api/_lib/invoiceNumber.js';

describe('invoice number formatting', () => {
  it('formats any stored series for school monthly invoice PDF headings', () => {
    expect(formatSchoolInvoiceNumberLabel('PAM-829')).toBe('PAM NR. 829');
    expect(formatSchoolInvoiceNumberLabel('MK-1629')).toBe('MK NR. 1629');
    expect(formatSchoolInvoiceNumberLabel('SF-001')).toBe('SF NR. 1');
    expect(formatSchoolInvoiceNumberLabel('PERŽIŪRA')).toBe('PERŽIŪRA');
  });

  it('previews the next number from invoice profile settings without consuming it', () => {
    expect(previewInvoiceNumber({ invoice_series: 'PAM', next_invoice_number: 829 })).toBe('PAM-829');
    expect(previewInvoiceNumber({ invoice_series: 'MK', next_invoice_number: 42 })).toBe('MK-42');
    expect(previewInvoiceNumber({ invoice_series: '', next_invoice_number: 1 })).toBe('');
    expect(formatStoredInvoiceNumber('ABC', 7)).toBe('ABC-007');
  });
});
