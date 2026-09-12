import type { SupabaseClient } from '@supabase/supabase-js';

/** Row shape across prod (used boolean) and newer schemas (used_at timestamptz). */
export type SchoolContractCompletionTokenRow = {
  id: string;
  contract_id: string;
  token: string;
  expires_at: string;
  used_at?: string | null;
  used?: boolean | null;
};

export function isSchoolContractCompletionTokenUsed(row: SchoolContractCompletionTokenRow): boolean {
  if (row.used_at) return true;
  return row.used === true;
}

export async function fetchSchoolContractCompletionToken(
  adminSb: SupabaseClient,
  token: string,
): Promise<{ data: SchoolContractCompletionTokenRow | null; error: string | null }> {
  const trimmed = token.trim();
  if (!trimmed) return { data: null, error: 'empty token' };

  const { data, error } = await adminSb
    .from('school_contract_completion_tokens')
    .select('*')
    .eq('token', trimmed)
    .maybeSingle();

  if (error) return { data: null, error: error.message };
  return { data: (data as SchoolContractCompletionTokenRow | null) ?? null, error: null };
}

export async function markSchoolContractCompletionTokenUsed(
  adminSb: SupabaseClient,
  tokenId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const { error: usedAtErr } = await adminSb
    .from('school_contract_completion_tokens')
    .update({ used_at: now })
    .eq('id', tokenId);

  if (usedAtErr?.message?.includes('used_at')) {
    await adminSb.from('school_contract_completion_tokens').update({ used: true }).eq('id', tokenId);
  }
}
