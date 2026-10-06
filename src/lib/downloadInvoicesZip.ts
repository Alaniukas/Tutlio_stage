import { zipSync } from 'fflate';
import {
  formatInvoiceDownloadFilename,
  parseContentDispositionFilename,
} from './invoiceDownloadFilename';

export type InvoicePdfDownloadRow = {
  id: string;
  invoice_number: string;
  issue_date?: string | null;
  organization_id?: string | null;
  origin?: string | null;
};

function uniqueZipEntryName(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  const dot = base.lastIndexOf('.');
  const stem = dot >= 0 ? base.slice(0, dot) : base;
  const ext = dot >= 0 ? base.slice(dot) : '';
  let index = 2;
  while (used.has(`${stem} (${index})${ext}`)) index += 1;
  const next = `${stem} (${index})${ext}`;
  used.add(next);
  return next;
}

async function fetchInvoicePdfBytes(
  invoice: InvoicePdfDownloadRow,
  headers: HeadersInit,
): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const res = await fetch(`/api/invoice-pdf?id=${encodeURIComponent(invoice.id)}`, { headers });
  if (!res.ok || !res.headers.get('content-type')?.includes('application/pdf')) return null;
  const blob = await res.blob();
  if (blob.size === 0) return null;
  const filename = parseContentDispositionFilename(res.headers.get('content-disposition'))
    || formatInvoiceDownloadFilename({
      invoiceNumber: invoice.invoice_number,
      issueDate: invoice.issue_date,
      organizationId: invoice.organization_id,
    });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), filename };
}

export async function downloadInvoicesAsZip(
  invoices: InvoicePdfDownloadRow[],
  options: {
    authHeaders: HeadersInit;
    zipName?: string;
  },
): Promise<{ downloaded: number; failedIds: string[] }> {
  const rows = invoices.filter((row) => row.origin !== 'external');
  const zipEntries: Record<string, Uint8Array> = {};
  const usedNames = new Set<string>();
  const failedIds: string[] = [];

  for (const invoice of rows) {
    try {
      const file = await fetchInvoicePdfBytes(invoice, options.authHeaders);
      if (!file) {
        failedIds.push(invoice.id);
        continue;
      }
      const entryName = uniqueZipEntryName(file.filename, usedNames);
      zipEntries[entryName] = file.bytes;
    } catch {
      failedIds.push(invoice.id);
    }
  }

  const downloaded = Object.keys(zipEntries).length;
  if (downloaded === 0) return { downloaded: 0, failedIds };

  const zipped = zipSync(zipEntries);
  const blob = new Blob([zipped], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = options.zipName || `saskaitos-${new Date().toISOString().slice(0, 10)}.zip`;
  anchor.click();
  URL.revokeObjectURL(url);
  return { downloaded, failedIds };
}

export async function downloadInvoicePdfFile(
  invoice: InvoicePdfDownloadRow,
  headers: HeadersInit,
): Promise<boolean> {
  try {
    const file = await fetchInvoicePdfBytes(invoice, headers);
    if (!file) return false;
    const url = URL.createObjectURL(new Blob([file.bytes], { type: 'application/pdf' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.filename;
    anchor.click();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}
