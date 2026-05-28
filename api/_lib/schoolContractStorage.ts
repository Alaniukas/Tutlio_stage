export const SCHOOL_CONTRACTS_BUCKET = 'school-contracts';

const PUBLIC_MARKER = `/object/public/${SCHOOL_CONTRACTS_BUCKET}/`;

/** Legacy public URL or plain storage path → object key in school-contracts bucket. */
export function extractSchoolContractStoragePath(urlOrPath: string): string {
  const trimmed = urlOrPath.trim();
  const idx = trimmed.indexOf(PUBLIC_MARKER);
  if (idx !== -1) return decodeURIComponent(trimmed.slice(idx + PUBLIC_MARKER.length));
  return trimmed;
}
