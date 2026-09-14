import type { SupabaseClient } from '@supabase/supabase-js';
import { isEmailOptedOut, parseEmailOptOutList } from './emailNotificationOptOut.js';

function normalizedSingleRecipient(to: unknown): string | null {
  if (Array.isArray(to)) return null;
  const email = String(to || '').trim().toLowerCase();
  return email && email.includes('@') ? email : null;
}

/**
 * Enforce tutor preferences on the server. The lookup uses the recipient rather
 * than browser-provided profile data, so an old or modified client cannot bypass
 * an opt-out. Database failures fail open to avoid silently losing operational
 * email during an outage.
 */
export async function shouldSkipTutorNotification(
  supabase: SupabaseClient,
  to: unknown,
  emailType: unknown,
): Promise<boolean> {
  if (emailType !== 'org_tutor_availability_notice') return false;
  const email = normalizedSingleRecipient(to);
  if (!email) return false;

  const { data, error } = await supabase
    .from('profiles')
    .select('email_notification_opt_out')
    .ilike('email', email)
    .limit(20);

  if (error || !data) return false;
  return data.some((profile) => isEmailOptedOut(
    parseEmailOptOutList(profile.email_notification_opt_out),
    'org_tutor_availability_notice',
  ));
}
