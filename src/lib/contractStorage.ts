import { supabase } from '@/lib/supabase';

const BUCKET = 'school-contracts';
const PUBLIC_MARKER = `/object/public/${BUCKET}/`;

/**
 * Extracts the storage path from a value that may be either a full public URL
 * (legacy) or already a plain path. Handles backward compatibility for data
 * stored before the bucket was made private.
 */
export function extractStoragePath(urlOrPath: string): string {
  const idx = urlOrPath.indexOf(PUBLIC_MARKER);
  if (idx !== -1) return decodeURIComponent(urlOrPath.slice(idx + PUBLIC_MARKER.length));
  return urlOrPath;
}

/**
 * Generate a short-lived signed URL for displaying/downloading a contract file.
 * Returns null if the value is empty or signing fails.
 */
export async function getContractSignedUrl(
  urlOrPath: string | null | undefined,
  expiresInSeconds = 3600,
): Promise<string | null> {
  if (!urlOrPath) return null;
  const path = extractStoragePath(urlOrPath);
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Upload a file to the school-contracts bucket and return just the storage path
 * (not a public URL). Use `getContractSignedUrl` to generate a temporary URL.
 */
export async function uploadContractFile(
  storagePath: string,
  file: Blob | File,
  contentType: string,
): Promise<{ path: string | null; error: string | null }> {
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    cacheControl: '3600',
    upsert: false,
    contentType,
  });
  if (error) return { path: null, error: error.message };
  return { path: storagePath, error: null };
}
