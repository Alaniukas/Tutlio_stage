import type { SupabaseClient } from '@supabase/supabase-js';

export async function findAuthUserByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<{ id: string; user_metadata?: Record<string, unknown> } | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 100 });
    if (error || !data.users?.length) break;
    const match = data.users.find((u) => (u.email || '').trim().toLowerCase() === normalized);
    if (match?.id) {
      return { id: match.id, user_metadata: match.user_metadata as Record<string, unknown> | undefined };
    }
    if (data.users.length < 100) break;
  }
  return null;
}
