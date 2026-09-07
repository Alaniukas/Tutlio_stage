import type { SupabaseClient } from '@supabase/supabase-js';

export function isAuthEmailAlreadyRegistered(message: string | undefined | null): boolean {
  return /already registered|already been registered|email_exists|user already exists|duplicate/i.test(
    message || '',
  );
}

type AuthUserHit = { id: string; user_metadata?: Record<string, unknown> };

export async function findAuthUserByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<AuthUserHit | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const fromRpc = await findAuthUserIdByRpc(supabase, normalized);
  if (fromRpc) return fromRpc;

  return findAuthUserByEmailViaList(supabase, normalized);
}

async function findAuthUserIdByRpc(
  supabase: SupabaseClient,
  normalized: string,
): Promise<AuthUserHit | null> {
  const { data, error } = await supabase.rpc('get_auth_user_id_by_email', { p_email: normalized });
  if (error || !data) return null;
  const id = typeof data === 'string' ? data : null;
  return id ? { id } : null;
}

async function findAuthUserByEmailViaList(
  supabase: SupabaseClient,
  normalized: string,
): Promise<AuthUserHit | null> {
  const perPage = 200;
  let seenFirstId: string | null = null;
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.warn('[findAuthUserByEmail] listUsers failed', error.message);
      break;
    }
    const users = (data?.users ?? []) as Array<{
      id: string;
      email?: string | null;
      user_metadata?: Record<string, unknown>;
    }>;
    if (!users.length) break;
    if (page === 1) seenFirstId = users[0]?.id ?? null;
    else if (users[0]?.id && users[0].id === seenFirstId) break;
    const match = users.find((u) => (u.email || '').trim().toLowerCase() === normalized);
    if (match?.id) {
      return { id: match.id, user_metadata: match.user_metadata as Record<string, unknown> | undefined };
    }
  }
  return null;
}
