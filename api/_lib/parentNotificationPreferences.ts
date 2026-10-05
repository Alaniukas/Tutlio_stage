import type { SupabaseClient } from '@supabase/supabase-js';
import { notificationKeyForType } from '../../src/lib/notificationPreferences.js';
import { userNotificationPreference } from './userNotificationPreferences.js';
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

  // Comment emails can contain both child and parent recipients. Parent settings
  // must not mute the child's copy; match parent contacts even before activation.
  if (emailType === 'session_comment_added') {
    const orgId = String(payload?.organizationId || payload?.organization_id || '').trim();
    const { data: parent } = await supabase.from('parent_profiles').select('id')
      .eq('email', email).limit(1).maybeSingle();
    if (!parent) {
      if (!orgId) return false;
      const results = await Promise.all([
        supabase.from('students').select('id').eq('organization_id', orgId)
          .eq('payer_email', email).limit(1).maybeSingle(),
        supabase.from('students').select('id').eq('organization_id', orgId)
          .eq('parent_secondary_email', email).limit(1).maybeSingle(),
      ]);
      if (!results.some((result) => result.data)) return false;
    }
  }

  const orgOptOut = await orgParentOptOut(supabase, payload);
  if (orgOptOut.includes(key)) return true;

  const { data, error } = await supabase
    .from('parent_profiles')
    .select('user_id, email_notification_opt_out, disable_lesson_reminders')
    .eq('email', email)
    .limit(1)
    .maybeSingle();

  if (error || !data) return false;
  const optOut = parseParentNotificationOptOut(
    data.email_notification_opt_out,
    data.disable_lesson_reminders === true,
  );
  if (key === 'lesson_reminders' && optOut.includes(key)) return true;
  const personalKey = notificationKeyForType(emailType);
  if (data.user_id && personalKey) {
    const enabled = await userNotificationPreference(supabase, data.user_id, personalKey);
    if (enabled !== null) return !enabled;
  }
  return optOut.includes(key);
}

/** Apply preferences to every recipient of a mixed student/parent comment email. */
export async function filterParentNotificationRecipients(
  supabase: SupabaseClient,
  recipients: string[],
  emailType: unknown,
  payload?: Record<string, unknown> | null,
): Promise<string[]> {
  const decisions = await Promise.all(recipients.map(async (email) => ({
    email,
    skipped: await shouldSkipParentNotification(supabase, email, emailType, payload),
  })));
  return decisions.filter((decision) => !decision.skipped).map((decision) => decision.email);
}
