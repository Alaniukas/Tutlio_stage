import { randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Reuse an unexpired parent link when the contract and its annex are sent together. */
export async function ensureExtraLessonsCompletionToken(
  supabase: SupabaseClient,
  contractId: string,
): Promise<string> {
  const { data: existing, error: lookupError } = await supabase
    .from('school_contract_completion_tokens')
    .select('token, expires_at')
    .eq('contract_id', contractId)
    .order('expires_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (existing?.token && (!existing.expires_at || Date.parse(existing.expires_at) > Date.now())) {
    return String(existing.token);
  }
  const token = randomBytes(32).toString('hex');
  const { error } = await supabase.from('school_contract_completion_tokens').insert({
    contract_id: contractId,
    token,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
  if (error) throw new Error(error.message);
  return token;
}
