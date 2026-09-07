/** Same logic as api/_lib/schoolContractPdfPath.ts — frontend-only copy for Vite (avoid importing api/ tree). */

export const SCHOOL_CONTRACTS_BUCKET = 'school-contracts';

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
