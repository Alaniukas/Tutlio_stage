import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPPORTED_LOCALES, type Locale } from '../../src/lib/i18n/locales.js';

function validLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Fallback for server-generated emails without an explicit top-level locale.
 * Multi-recipient messages must supply a shared locale explicitly; never use
 * one recipient's preference for an entire group. No account data is returned.
 */
export async function notificationLocale(
  client: Pick<SupabaseClient, 'from'> | null,
  to: unknown,
  requested: unknown,
  organizationLocale?: unknown,
): Promise<Locale> {
  if (validLocale(requested)) return requested;
  const fallback = validLocale(organizationLocale) ? organizationLocale : 'lt';
  const recipients = Array.isArray(to) ? to : [to];
  if (!client || recipients.length !== 1 || typeof recipients[0] !== 'string') return fallback;
  try {
    const { data, error } = await client.from('profiles').select('preferred_locale')
      .eq('email', recipients[0].trim().toLowerCase()).maybeSingle();
    if (error) {
      console.error('[locale] Notification preference lookup failed');
      return fallback;
    }
    return validLocale(data?.preferred_locale) ? data.preferred_locale : fallback;
  } catch {
    console.error('[locale] Notification preference lookup failed');
    return fallback;
  }
}
