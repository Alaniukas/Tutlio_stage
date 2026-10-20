import { describe, expect, it } from 'vitest';
import { matchesInvoiceNumber } from '@/lib/invoiceNumberSearch';

describe('invoice number search', () => {
  it.each(['839', '00839', ' PAM-00839 ', 'pam 00839', 'pam-839', 'PAM'])('finds a formatted number using %s', search => {
    expect(matchesInvoiceNumber('PAM-00839', search)).toBe(true);
  });
  it('accepts an unpadded stored number and numeric parts without zeroes', () => {
    expect(matchesInvoiceNumber('PAM-839', '00839')).toBe(true);
    expect(matchesInvoiceNumber('PAM-839', '83')).toBe(true);
    expect(matchesInvoiceNumber('PAM-840', '839')).toBe(false);
    expect(matchesInvoiceNumber('PAM-839', 'MK-839')).toBe(false);
    expect(matchesInvoiceNumber('PAM-839', '   ')).toBe(true);
  });
});
