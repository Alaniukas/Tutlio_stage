import { isManoKorepetitoriusOrg, MANO_KOREPETITORIUS_QA_ORG_ID } from './marketMoney.js';

function usesMkInvoiceDownloadFilename(organizationId?: string | null): boolean {
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

/** MK payer: `MK Nr. 1649 (2026-08-31).pdf`; tutor: `EVAJAU (202605).pdf`. */
export function formatInvoiceDownloadFilename(input: InvoiceDownloadFilenameInput): string {
  if (usesMkInvoiceDownloadFilename(input.organizationId)) {
    const tutorNumber = String(input.invoiceNumber || '').trim().match(/^(?![Mm][Kk]-)(\p{L}{2,6})-(\d{4}(?:0[1-9]|1[0-2]))$/u);
    if (tutorNumber) return `${tutorNumber[1].toUpperCase()} (${tutorNumber[2]}).pdf`;
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
  const safe = escaped.replace(/[\r\n]/g, '').replace(/\\/g, '-');
  const ascii = safe.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '-');
  const header = `attachment; filename="${ascii}"`;
  if (ascii === safe) return header;
  const encoded = encodeURIComponent(safe).replace(/['()*]/g,
    char => '%' + char.charCodeAt(0).toString(16).toUpperCase());
  return header + "; filename*=UTF-8''" + encoded;
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
