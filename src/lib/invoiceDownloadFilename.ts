import { isManoKorepetitoriusOrg, MANO_KOREPETITORIUS_QA_ORG_ID } from './marketMoney.js';

function usesMkPayerInvoiceDownloadFilename(organizationId?: string | null): boolean {
  if (!organizationId) return false;
  if (isManoKorepetitoriusOrg(organizationId)) return true;
  return organizationId.trim().toLowerCase() === MANO_KOREPETITORIUS_QA_ORG_ID;
}

export type InvoiceDownloadFilenameInput = {
  invoiceNumber: string;
  issueDate?: string | null;
  organizationId?: string | null;
};

export function normalizeInvoiceIssueDateIso(issueDate?: string | null): string | null {
  if (!issueDate) return null;
  const raw = String(issueDate).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

/** Mano Korepetitorius payer S.F.: `MK Nr. 1649 (2026-08-31).pdf` */
export function formatInvoiceDownloadFilename(input: InvoiceDownloadFilenameInput): string {
  if (usesMkPayerInvoiceDownloadFilename(input.organizationId)) {
    const match = String(input.invoiceNumber || '').trim().match(/^MK-0*(\d+)$/i);
    const issueIso = normalizeInvoiceIssueDateIso(input.issueDate);
    if (match && issueIso) {
      return `MK Nr. ${parseInt(match[1], 10)} (${issueIso}).pdf`;
    }
  }
  const safe = String(input.invoiceNumber || 'saskaita').replace(/[/\\?%*:|"<>]/g, '-');
  return `${safe}.pdf`;
}

export function invoiceDownloadContentDisposition(filename: string): string {
  const escaped = filename.replace(/"/g, "'");
  return `attachment; filename="${escaped}"`;
}

export function parseContentDispositionFilename(header: string | null | undefined): string | null {
  if (!header) return null;
  const star = header.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      return null;
    }
  }
  const quoted = header.match(/filename\s*=\s*"([^"]+)"/i);
  if (quoted?.[1]) return quoted[1];
  const bare = header.match(/filename\s*=\s*([^;\s]+)/i);
  return bare?.[1] || null;
}
