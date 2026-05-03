/**
 * Human-readable Storage object key for school contract PDFs.
 * Stored under `{orgId}/contracts/{contractId}/` so each contract owns a stable folder;
 * regenerate overwrites via upsert instead of accumulating random keys.
 */

export function sanitizeContractNumberForFilename(raw: unknown, maxLen = 80): string {
  const s = String(raw ?? '')
    .trim()
    .replace(/[\u0000-\u001f\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');
  return s.slice(0, maxLen);
}

export function schoolContractPdfStoragePath(params: {
  organizationId: string;
  contractId: string;
  contractNumber?: string | null;
}): string {
  const slug = sanitizeContractNumberForFilename(params.contractNumber || '');
  const compactId = String(params.contractId || '').replace(/-/g, '');
  const fileBase =
    slug.length > 0 ? `Sutartis-${slug}` : compactId.length >= 8 ? `Sutartis-${compactId.slice(0, 8)}` : 'Sutartis';
  const safe = `${fileBase}.pdf`;
  return `${params.organizationId}/contracts/${params.contractId}/${safe}`;
}
