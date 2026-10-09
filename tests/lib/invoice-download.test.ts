import { Blob as NodeBlob } from 'node:buffer';
import { unzipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadInvoicePdfFile, downloadInvoicesAsZip } from '@/lib/downloadInvoicesZip';

const createUrl = vi.fn(() => 'blob:invoice-download');
const revokeUrl = vi.fn();
const clicks: Array<{ connected: boolean; filename: string }> = [];

beforeEach(() => {
  vi.useFakeTimers();
  clicks.length = 0; createUrl.mockClear(); revokeUrl.mockClear();
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('URL', { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    clicks.push({ connected: this.isConnected, filename: this.download });
  });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function pdfResponse(filename: string, bytes = '%PDF-example') {
  return new Response(bytes, { headers: {
    'content-type': 'application/pdf',
    'content-disposition': 'attachment; filename="' + filename + '"',
  } });
}

describe('invoice PDF and ZIP downloads', () => {
  it('routes school payer PDFs and mixed ZIP entries to their own invoice source', async () => {
    const fetch = vi.fn(async (url: string) => pdfResponse(url.includes('source=school_monthly') ? 'PAM-49.pdf' : 'SF-2.pdf'));
    vi.stubGlobal('fetch', fetch);
    const headers = { Authorization: 'Bearer admin' };
    expect(await downloadInvoicePdfFile({ id: 'payer', invoice_number: 'PAM-49', source: 'school_monthly' }, headers)).toBe(true);
    expect(fetch).toHaveBeenCalledWith('/api/invoice-pdf?id=payer&source=school_monthly', { headers });
    const result = await downloadInvoicesAsZip([
      { id: 'payer', invoice_number: 'PAM-49', source: 'school_monthly' },
      { id: 'teacher', invoice_number: 'SF-2' },
    ], { authHeaders: headers });
    expect(result).toEqual({ downloaded: 2, failedIds: [] });
    expect(fetch).toHaveBeenCalledWith('/api/invoice-pdf?id=teacher', { headers });
    const blob = createUrl.mock.calls[1][0] as unknown as NodeBlob;
    expect(Object.keys(unzipSync(new Uint8Array(await blob.arrayBuffer())))).toEqual(['PAM-49.pdf', 'SF-2.pdf']);
  });

  it('downloads the server filename with an attached link and retains the blob until the browser consumes it', async () => {
    const fetch = vi.fn(async () => pdfResponse('EVAJAU (202609).pdf'));
    vi.stubGlobal('fetch', fetch);
    const headers = { Authorization: 'Bearer test-token' };
    expect(await downloadInvoicePdfFile({ id: 'invoice', invoice_number: 'legacy-name' }, headers)).toBe(true);
    expect(fetch).toHaveBeenCalledWith('/api/invoice-pdf?id=invoice', { headers });
    expect(clicks).toEqual([{ connected: true, filename: 'EVAJAU (202609).pdf' }]);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revokeUrl).not.toHaveBeenCalled();
    vi.advanceTimersByTime(30_000);
    expect(revokeUrl).toHaveBeenCalledWith('blob:invoice-download');
  });

  it('exports all successful customer PDFs in one ZIP and reports failed rows', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('broken')
      ? new Response('Unavailable', { status: 500 })
      : pdfResponse('MK Nr. 1685 (2026-09-30).pdf', '%PDF-' + url)));
    const result = await downloadInvoicesAsZip([
      { id: 'first', invoice_number: 'MK-1685' },
      { id: 'second', invoice_number: 'MK-1686' },
      { id: 'broken', invoice_number: 'MK-1687' },
      { id: 'external', invoice_number: 'MK-1688', origin: 'external' },
    ], { authHeaders: {}, zipName: 'september.zip' });
    expect(result).toEqual({ downloaded: 2, failedIds: ['broken'] });
    expect(clicks).toEqual([{ connected: true, filename: 'september.zip' }]);
    const blob = createUrl.mock.calls[0][0] as unknown as NodeBlob;
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()));
    expect(Object.keys(files)).toEqual([
      'MK Nr. 1685 (2026-09-30).pdf', 'MK Nr. 1685 (2026-09-30) (2).pdf',
    ]);
    expect(new TextDecoder().decode(Object.values(files)[0])).toContain('first');
    expect(new TextDecoder().decode(Object.values(files)[1])).toContain('second');
  });

  it.each([
    () => new Response('Forbidden', { status: 403 }),
    () => new Response('Invalid JSON response', { headers: { 'content-type': 'application/json' } }),
    () => new Response('', { headers: { 'content-type': 'application/pdf' } }),
  ])('does not report success for an unavailable or empty PDF', async response => {
    vi.stubGlobal('fetch', vi.fn(async () => response()));
    expect(await downloadInvoicePdfFile({ id: 'invoice', invoice_number: 'MK-1' }, {})).toBe(false);
    expect(clicks).toEqual([]);
    expect(createUrl).not.toHaveBeenCalled();
  });
});
