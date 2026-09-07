import type { SupabaseClient } from '@supabase/supabase-js';
import { findAuthUserByEmail } from './findAuthUserByEmail.js';

export function shouldSkipStudentInvite(opts: {
  linkedUserId?: string | null;
  authUserExists: boolean;
  existingLinkedStudent: boolean;
}): boolean {
  return Boolean(opts.linkedUserId) || opts.authUserExists || opts.existingLinkedStudent;
}

export async function studentRegistrationAlreadyActive(
  supabase: SupabaseClient,
  opts: { email?: string | null; linkedUserId?: string | null },
): Promise<boolean> {
  if (opts.linkedUserId) return true;
  const email = (opts.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) return false;

  const { data: linkedRow } = await supabase
    .from('students')
    .select('id')
    .ilike('email', email)
    .not('linked_user_id', 'is', null)
    .limit(1)
    .maybeSingle();
  if (linkedRow?.id) return true;

  const auth = await findAuthUserByEmail(supabase, email);
  return Boolean(auth?.id);
}

export async function parentRegistrationAlreadyActive(
  supabase: SupabaseClient,
  email: string,
): Promise<boolean> {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed || !trimmed.includes('@')) return false;

  const { data: parentRow } = await supabase
    .from('parent_profiles')
    .select('id')
    .ilike('email', trimmed)
    .limit(1)
    .maybeSingle();
  if (parentRow?.id) return true;

  const auth = await findAuthUserByEmail(supabase, trimmed);
  return Boolean(auth?.id);
}
