import type { SupabaseClient } from '@supabase/supabase-js';
import type { Locale } from './i18n/locales';

/** Supabase returns database errors as values, not rejected promises. */
export async function persistProfileLocale(
  client: Pick<SupabaseClient, 'auth' | 'from'>,
  locale: Locale,
  previousSave?: Promise<void>,
): Promise<void> {
  const { data, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = data.session?.user.id;
  if (!userId) return;
  if (previousSave) {
    await previousSave.catch(() => {});
    const { data: current, error } = await client.auth.getSession();
    if (error) throw error;
    // A queued selection belongs to the account active when it was made.
    if (current.session?.user.id !== userId) return;
  }
  const { error } = await client.from('profiles').update({ preferred_locale: locale }).eq('id', userId);
  if (error) throw error;
}
