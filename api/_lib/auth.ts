import type { VercelRequest } from '../types';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';

/**
 * Verifies that the request is either from an authenticated user (Bearer token)
 * or from an internal server-to-server call (x-internal-key matching service role key).
 * Returns the authenticated user's ID on success, or null on failure.
 */
export async function verifyRequestAuth(
  req: VercelRequest
): Promise<{ userId: string | null; isInternal: boolean } | null> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  const internalKey = typeof req.headers['x-internal-key'] === 'string' ? req.headers['x-internal-key'] : '';
  if (internalKey && serviceKey && internalKey.length === serviceKey.length) {
    try {
      if (timingSafeEqual(Buffer.from(internalKey, 'utf8'), Buffer.from(serviceKey, 'utf8'))) {
        return { userId: null, isInternal: true };
      }
    } catch { /* length mismatch — fall through */ }
  }

  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  if (!authHeader.startsWith('Bearer ')) return null;
  if (!serviceKey) return null;

  const token = authHeader.slice(7);
  const urls = [process.env.SUPABASE_URL, process.env.VITE_SUPABASE_URL].filter(
    (u, i, arr): u is string => Boolean(u) && arr.indexOf(u) === i,
  );
  if (urls.length === 0) return null;

  for (const url of urls) {
    const sb = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await sb.auth.getUser(token);
    if (!error && data.user) {
      return { userId: data.user.id, isInternal: false };
    }
  }

  return null;
}
