import type { VercelRequest } from '../types';
import { createClient } from '@supabase/supabase-js';

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
  if (internalKey && serviceKey && internalKey === serviceKey) {
    return { userId: null, isInternal: true };
  }

  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  if (!authHeader.startsWith('Bearer ')) return null;

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  if (!url || !serviceKey) return null;

  const sb = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await sb.auth.getUser(authHeader.slice(7));
  if (error || !data.user) return null;

  return { userId: data.user.id, isInternal: false };
}
