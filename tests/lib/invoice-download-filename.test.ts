import { describe, expect, it } from 'vitest';
import {
  formatInvoiceDownloadFilename,
  invoiceDownloadContentDisposition,
  normalizeInvoiceIssueDateIso,
  parseContentDispositionFilename,
} from '@/lib/invoiceDownloadFilename';
import { MANO_KOREPETITORIUS_ORG_ID, MANO_KOREPETITORIUS_QA_ORG_ID } from '@/lib/marketMoney';

describe('invoiceDownloadFilename', () => {
  it.each([
    ['EVAJAU-202605', 'EVAJAU (202605).pdf'],
    ['GABMIK-202605', 'GABMIK (202605).pdf'],
    ['PIJOŽE-202609', 'PIJOŽE (202609).pdf'],
  ])('uses the monthly tutor number in the filename for %s', (invoiceNumber, expected) => {
    expect(formatInvoiceDownloadFilename({
      invoiceNumber, organizationId: MANO_KOREPETITORIUS_ORG_ID,
    })).toBe(expected);
    expect(formatInvoiceDownloadFilename({
      invoiceNumber, organizationId: 'other-org',
    })).toBe(invoiceNumber + '.pdf');
  });

  it('formats Mano Korepetitorius payer S.F. as MK Nr. {n} ({date}).pdf', () => {
    expect(formatInvoiceDownloadFilename({
      invoiceNumber: 'MK-01649',
      issueDate: '2026-08-31',
      organizationId: MANO_KOREPETITORIUS_ORG_ID,
    })).toBe('MK Nr. 1649 (2026-08-31).pdf');
  });

  it('formats DEMO MK QA org the same as production MK', () => {
    expect(formatInvoiceDownloadFilename({
      invoiceNumber: 'MK-01649',
      issueDate: '2026-08-31',
      organizationId: MANO_KOREPETITORIUS_QA_ORG_ID,
    })).toBe('MK Nr. 1649 (2026-08-31).pdf');
  });

  it('keeps generic invoice numbers for other orgs', () => {
    expect(formatInvoiceDownloadFilename({
      invoiceNumber: 'SF-2026-001',
      issueDate: '2026-08-31',
      organizationId: 'other-org',
    })).toBe('SF-2026-001.pdf');
  });

  it('normalizes issue dates and content-disposition headers', () => {
    expect(normalizeInvoiceIssueDateIso('2026-08-31T12:00:00Z')).toBe('2026-08-31');
    const header = invoiceDownloadContentDisposition('MK Nr. 1649 (2026-08-31).pdf');
    expect(parseContentDispositionFilename(header)).toBe('MK Nr. 1649 (2026-08-31).pdf');
  });

  it('does not mistake a six-digit customer sequence for a tutor service month', () => {
    expect(formatInvoiceDownloadFilename({
      invoiceNumber: 'MK-202605', issueDate: '2026-09-30',
      organizationId: MANO_KOREPETITORIUS_ORG_ID,
    })).toBe('MK Nr. 202605 (2026-09-30).pdf');
  });

  it('keeps Lithuanian tutor initials in a valid ASCII HTTP header', () => {
    const filename = 'PIJOŽE (202609).pdf';
    const header = invoiceDownloadContentDisposition(filename);
    expect(header).toMatch(/^[\x20-\x7e]+$/);
    expect(header).toContain('filename="PIJOZE (202609).pdf"');
    expect(parseContentDispositionFilename(header)).toBe(filename);
  });
});
