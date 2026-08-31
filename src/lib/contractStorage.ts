import { supabase } from '@/lib/supabase';
import {
  SCHOOL_CONTRACTS_BUCKET,
  extractSchoolContractStoragePath,
} from '@/lib/schoolContractPdfPath';

const BUCKET = SCHOOL_CONTRACTS_BUCKET;

/**
 * Extracts the storage path from a value that may be a public URL, signed URL,
 * or already a plain path.
 */
export function extractStoragePath(urlOrPath: string): string {
  return extractSchoolContractStoragePath(urlOrPath);
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
 * Open a stored contract file (private bucket) in a new tab via a short-lived
 * signed URL. A blank tab is opened synchronously first to keep the user-gesture
 * (avoids popup blockers), then redirected once the signed URL resolves.
 * Returns false if signing failed (caller can surface a toast).
 */
export async function openContractFileInNewTab(
  urlOrPath: string | null | undefined,
): Promise<boolean> {
  if (typeof window === 'undefined' || !urlOrPath) return false;
  const tab = window.open('', '_blank');
  const signed = await getContractSignedUrl(urlOrPath);
  if (!signed) {
    if (tab) tab.close();
    return false;
  }
  if (tab) tab.location.href = signed;
  else window.open(signed, '_blank', 'noopener,noreferrer');
  return true;
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
