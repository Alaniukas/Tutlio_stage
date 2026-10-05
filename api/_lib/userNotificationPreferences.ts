import type { SupabaseClient } from '@supabase/supabase-js';
import { notificationKeyForType, type NotificationKey } from '../../src/lib/notificationPreferences.js';

const normalizedEmail = (value: string) => value.trim().toLowerCase();
const emailPattern = (value: string) => normalizedEmail(value).replace(/[\\%_]/g, '\\$&');

/** Use linked contact identities as well as login email: managed accounts may
 * log in with an alias while notifications go to their real contact address. */
export async function notificationUserIdsForEmail(db: SupabaseClient, email: string): Promise<string[]> {
  const pattern = emailPattern(email);
  const results = await Promise.all([
    db.from('profiles').select('id').ilike('email', pattern),
    db.from('parent_profiles').select('user_id').ilike('email', pattern),
    db.from('students').select('linked_user_id').ilike('email', pattern).not('linked_user_id', 'is', null),
    db.from('students').select('parent_user_id').ilike('payer_email', pattern).not('parent_user_id', 'is', null),
  ]);
  for (const result of results) if (result.error) throw result.error;
  return [...new Set(results.flatMap(result => (result.data || []).flatMap(row =>
    [row.id, row.user_id, row.linked_user_id, row.parent_user_id].filter((id): id is string => typeof id === 'string' && Boolean(id)))))];
}

export async function userNotificationPreference(db: SupabaseClient, userId: string,
  key: NotificationKey): Promise<boolean | null> {
  const { data, error } = await db.from('user_notification_preferences').select('enabled')
    .eq('user_id', userId).eq('category', key).maybeSingle();
  if (error) throw error;
  return typeof data?.enabled === 'boolean' ? data.enabled : null;
}

export async function shouldSkipUserNotification(db: SupabaseClient, userId: string,
  type: unknown): Promise<boolean> {
  const key = notificationKeyForType(type);
  if (!key) return false;
  return await userNotificationPreference(db, userId, key) === false;
}

export async function shouldSkipNotificationForEmail(db: SupabaseClient, email: string,
  type: unknown): Promise<boolean> {
  const key = notificationKeyForType(type);
  if (!key) return false;
  const ids = await notificationUserIdsForEmail(db, email);
  if (!ids.length) return false;
  const { data, error } = await db.from('user_notification_preferences').select('enabled')
    .in('user_id', ids).eq('category', key).eq('enabled', false).limit(1);
  if (error) throw error;
  return Boolean(data?.length);
}

/** Errors remain visible to the sender; do not silently send optional alerts
 * when an established preference cannot be checked. Mandatory mail bypasses. */
export async function filterUserNotificationRecipients(db: SupabaseClient, to: string | string[],
  type: unknown): Promise<string[]> {
  const recipients = [...new Set((Array.isArray(to) ? to : [to]).map(normalizedEmail).filter(Boolean))];
  if (!notificationKeyForType(type)) return recipients;
  const decisions = await Promise.all(recipients.map(async email => ({ email,
    skipped: await shouldSkipNotificationForEmail(db, email, type) })));
  return decisions.filter(row => !row.skipped).map(row => row.email);
}
