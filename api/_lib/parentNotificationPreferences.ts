import type { SupabaseClient } from '@supabase/supabase-js';
import {
  parentNotificationKeyForEmailType,
  parseParentNotificationOptOut,
} from '../../src/lib/parentNotificationPreferences.js';

function normalizedSingleRecipient(to: unknown): string | null {
  if (Array.isArray(to)) return null;
  const email = String(to || '').trim().toLowerCase();
  return email && email.includes('@') ? email : null;
}

/**
 * Registered parents can opt out of optional email/push categories. A missing
 * preference row or a database error fails open so operational mail is not
 * accidentally lost during a migration or outage.
 */
export async function shouldSkipParentNotification(
  supabase: SupabaseClient,
  to: unknown,
  emailType: unknown,
  payload?: Record<string, unknown> | null,
): Promise<boolean> {
  const key = parentNotificationKeyForEmailType(emailType, payload);
  const email = normalizedSingleRecipient(to);
  if (!key || !email) return false;

  const { data, error } = await supabase
    .from('parent_profiles')
    .select('email_notification_opt_out, disable_lesson_reminders')
    .eq('email', email)
    .limit(1)
    .maybeSingle();

  if (error || !data) return false;
  const optOut = parseParentNotificationOptOut(
    data.email_notification_opt_out,
    data.disable_lesson_reminders === true,
  );
  return optOut.includes(key);
}
