import { describe, expect, it } from 'vitest';
import {
  formatInvoiceDownloadFilename,
  invoiceDownloadContentDisposition,
  normalizeInvoiceIssueDateIso,
  parseContentDispositionFilename,
} from '@/lib/invoiceDownloadFilename';
import { MANO_KOREPETITORIUS_ORG_ID, MANO_KOREPETITORIUS_QA_ORG_ID } from '@/lib/marketMoney';

describe('invoiceDownloadFilename', () => {
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
});
