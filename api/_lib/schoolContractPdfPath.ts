/**
 * Human-readable Storage object key for school contract PDFs.
 * Stored under `{orgId}/contracts/{contractId}/` so each contract owns a stable folder;
 * regenerate overwrites via upsert instead of accumulating random keys.
 */

/** The (private) Storage bucket holding school contract templates + generated PDFs. */
export const SCHOOL_CONTRACTS_BUCKET = 'school-contracts';

/**
 * Resolve the in-bucket object key from a stored value that may be a public
 * Storage URL (legacy), a signed URL, or an already-bare path. The
 * `school-contracts` bucket is private, so callers must mint a signed URL from
 * this path (service role) instead of fetching a public URL directly.
 */
export function extractSchoolContractStoragePath(urlOrPath: string): string {
  const value = String(urlOrPath || '');
  const markers = [
    `/object/public/${SCHOOL_CONTRACTS_BUCKET}/`,
    `/object/sign/${SCHOOL_CONTRACTS_BUCKET}/`,
    `/object/${SCHOOL_CONTRACTS_BUCKET}/`,
  ];
  for (const marker of markers) {
    const idx = value.indexOf(marker);
    if (idx !== -1) return decodeURIComponent(value.slice(idx + marker.length).replace(/\?.*$/, ''));
  }
  return value;
}

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
