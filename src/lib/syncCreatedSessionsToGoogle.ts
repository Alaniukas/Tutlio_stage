import type { SupabaseClient } from '@supabase/supabase-js';
import { authHeaders } from './apiHelpers';

/** Optional post-save sync: one eligibility read, then small sequential batches. */
export async function syncCreatedSessionsToGoogle(
  supabase: SupabaseClient,
  userId: string,
  createdIds: string[],
): Promise<void> {
  const sessionIds = [...new Set(createdIds)];
  if (sessionIds.length === 0) return;
  const { data: profile, error } = await supabase.from('profiles')
    .select('google_calendar_connected, google_calendar_sync_enabled')
    .eq('id', userId).maybeSingle();
  if (error) throw new Error('Could not check Google Calendar sync settings');
  if (!profile?.google_calendar_connected || !profile.google_calendar_sync_enabled) return;

  const headers = await authHeaders();
  for (let offset = 0; offset < sessionIds.length; offset += 10) {
    const response = await fetch('/api/google-calendar-sync', {
      method: 'POST', headers,
      body: JSON.stringify({ userId, sessionIds: sessionIds.slice(offset, offset + 10) }),
    });
    if (!response.ok) throw new Error(`Google Calendar sync failed (${response.status})`);
  }
}
