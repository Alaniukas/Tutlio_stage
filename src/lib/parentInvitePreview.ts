import { supabase } from '@/lib/supabase';

export type ParentInvitePreviewRow = {
  token?: string;
  used: boolean;
  parent_email: string;
  parent_name: string | null;
  student_full_name: string | null;
  parent_phone?: string | null;
};

/** RPC returns a set; avoid .maybeSingle() — PostgREST responds 406 when there are 0 rows. */
export async function fetchParentInvitePreviewByToken(
  pToken: string,
): Promise<{ data: ParentInvitePreviewRow | null; error: Error | null }> {
  const trimmed = pToken.trim();
  if (!trimmed) {
    return { data: null, error: null };
  }

  const { data, error } = await supabase.rpc('get_parent_invite_preview', { p_token: trimmed });

  if (error) {
    return { data: null, error: error as Error };
  }

  const row = (Array.isArray(data) ? data[0] : data) as ParentInvitePreviewRow | undefined;
  return { data: row ?? null, error: null };
}

export async function fetchParentInvitePreviewByCode(
  pCode: string,
  pEmail: string,
): Promise<{ data: (ParentInvitePreviewRow & { token: string }) | null; error: Error | null }> {
  const code = pCode.trim().toUpperCase();
  const email = pEmail.trim();
  if (!code || !email) {
    return { data: null, error: null };
  }

  const { data, error } = await supabase.rpc('get_parent_invite_preview_by_code', {
    p_code: code,
    p_email: email,
  });

  if (error) {
    return { data: null, error: error as Error };
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | (ParentInvitePreviewRow & { token: string })
    | undefined;
  return { data: row ?? null, error: null };
}
