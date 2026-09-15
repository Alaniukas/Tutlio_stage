import type { SupabaseClient } from '@supabase/supabase-js';
import {
  parentNotificationKeyForEmailType,
  parseOrgParentNotificationOptOut,
  parseParentNotificationOptOut,
  type ParentNotificationKey,
} from '../../src/lib/parentNotificationPreferences.js';

function normalizedSingleRecipient(to: unknown): string | null {
  if (Array.isArray(to)) return null;
  const email = String(to || '').trim().toLowerCase();
  return email && email.includes('@') ? email : null;
}

async function orgParentOptOut(
  supabase: SupabaseClient,
  payload?: Record<string, unknown> | null,
): Promise<ParentNotificationKey[]> {
  const orgId = String(payload?.organizationId || payload?.organization_id || '').trim();
  if (!orgId) return [];
  const { data, error } = await supabase
    .from('organizations')
    .select('features')
    .eq('id', orgId)
    .maybeSingle();
  if (error || !data) return [];
  return parseOrgParentNotificationOptOut((data as { features?: unknown }).features);
}

/**
 * Org admins can disable a parent-email category for everyone. Registered
 * parents can still opt out of the remaining categories. A missing preference
 * row or a database error fails open so operational mail is not lost.
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

  const orgOptOut = await orgParentOptOut(supabase, payload);
  if (orgOptOut.includes(key)) return true;

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
