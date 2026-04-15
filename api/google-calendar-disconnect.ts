// ─── Vercel Serverless Function: Disconnect Google Calendar ──────────────────
// POST /api/google-calendar-disconnect
// Removes Google Calendar connection and deletes all synced events

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { deleteAllCalendarEvents, refreshAccessToken } from './_lib/google-calendar.js';
import { verifyRequestAuth } from './_lib/auth.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await verifyRequestAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    // Get user with tokens
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('google_calendar_access_token, google_calendar_refresh_token, google_calendar_token_expiry')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!profile.google_calendar_access_token) {
      return res.status(400).json({ error: 'Google Calendar not connected' });
    }

    // Refresh token if needed
    let accessToken = profile.google_calendar_access_token;
    const isExpired = profile.google_calendar_token_expiry && new Date(profile.google_calendar_token_expiry) <= new Date();

    if (isExpired && profile.google_calendar_refresh_token) {
      const newToken = await refreshAccessToken(profile.google_calendar_refresh_token);
      if (newToken) {
        accessToken = newToken;
      }
    }

    // Delete all calendar events for this user
    try {
      await deleteAllCalendarEvents(userId, accessToken);
    } catch (err) {
      console.error('Failed to delete calendar events:', err);
      // Continue anyway
    }

    // Clear tokens from database
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        google_calendar_access_token: null,
        google_calendar_refresh_token: null,
        google_calendar_token_expiry: null,
        google_calendar_connected: false,
        google_calendar_sync_enabled: false,
      })
      .eq('id', userId);

    if (updateError) {
      return res.status(500).json({ error: 'Failed to disconnect' });
    }

    // Clear event IDs from sessions and availability
    await supabase
      .from('sessions')
      .update({ google_calendar_event_id: null })
      .eq('tutor_id', userId);

    await supabase
      .from('availability')
      .update({ google_calendar_event_id: null })
      .eq('tutor_id', userId);

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('Disconnect error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
