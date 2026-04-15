// ─── Vercel Serverless Function: Google Calendar OAuth Callback ──────────────
// GET /api/google-calendar-callback
// Handles Google OAuth callback and stores tokens

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, state: userId, error } = req.query;

    if (error) {
      const appUrl = process.env.APP_URL || 'https://tutlio.lt';
      return res.redirect(`${appUrl}/calendar?gcal_error=${error}`);
    }

    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Missing authorization code' });
    }

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'Missing user ID' });
    }

    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URL || `${process.env.APP_URL}/api/google-calendar-callback`;

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return res.status(500).json({ error: 'Google OAuth not configured' });
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error('Token exchange failed:', errorData);
      return res.status(500).json({ error: 'Failed to exchange token' });
    }

    const tokens = await tokenResponse.json();
    const { access_token, refresh_token, expires_in } = tokens;

    if (!access_token || !refresh_token) {
      return res.status(500).json({ error: 'Invalid token response' });
    }

    // Calculate token expiry
    const expiryDate = new Date();
    expiryDate.setSeconds(expiryDate.getSeconds() + expires_in);

    // Store tokens in database
    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        google_calendar_access_token: access_token,
        google_calendar_refresh_token: refresh_token,
        google_calendar_token_expiry: expiryDate.toISOString(),
        google_calendar_connected: true,
        google_calendar_sync_enabled: true,
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Failed to store tokens:', updateError);
      return res.status(500).json({ error: 'Failed to store tokens' });
    }

    // Trigger initial sync (must hit same origin so APP_URL must be set in production)
    const appUrl = process.env.APP_URL || 'https://tutlio.lt';
    try {
      await fetch(`${appUrl}/api/google-calendar-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-key': process.env.SUPABASE_SERVICE_ROLE_KEY || '',
        },
        body: JSON.stringify({ userId }),
      });
    } catch (syncErr) {
      console.error('Initial sync failed:', syncErr);
      // Don't fail the whole flow
    }

    // Redirect back to calendar with success
    return res.redirect(`${appUrl}/calendar?gcal_connected=true`);
  } catch (err: any) {
    console.error('Google Calendar callback error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
