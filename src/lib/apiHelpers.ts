import { supabase } from '@/lib/supabase';

/**
 * Returns headers with Content-Type and the current user's Bearer token (if available).
 * Used for authenticated fetch calls to our API routes.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
  } catch {
    // swallow — unauthenticated calls will be rejected server-side
  }
  return headers;
}
