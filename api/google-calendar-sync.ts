// ─── Vercel Serverless Function: Google Calendar Manual Sync ─────────────────
// POST /api/google-calendar-sync
// Syncs sessions to Google Calendar (availability/free time blocks are NOT synced)
// If sessionId provided, syncs only that session. Otherwise syncs all sessions.
// Full sync is serialized per userId to avoid race conditions
// when multiple triggers (callback, Calendar load, session edit) run at once.

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { syncAllEventsToGoogle, syncSessionToGoogle } from './_lib/google-calendar.js';
import { verifyRequestAuth } from './_lib/auth.js';
import { getOrgAdminSeatByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Per-user lock: only one full sync at a time so we don't create duplicate availability events
const fullSyncLocks = new Map<string, Promise<any>>();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await verifyRequestAuth(req);
  if (!auth) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { userId, sessionId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    // Get user with tokens
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (!auth.isInternal) {
      if (!auth.userId) return res.status(401).json({ error: 'Unauthorized' });
      const seat = await getOrgAdminSeatByUserId(supabase, auth.userId);
      if (seat) {
        if (
          seat.status !== 'active'
          || !hasOrgAdminPermission(seat.role, seat.permissions, 'sessions.edit')
          || !profile.organization_id
          || seat.organizationId !== profile.organization_id
        ) {
          return res.status(403).json({ error: 'Insufficient organization permission' });
        }
      } else if (auth.userId !== userId) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }

    if (!profile.google_calendar_connected || !profile.google_calendar_sync_enabled) {
      return res.status(400).json({ error: 'Google Calendar not connected or sync disabled' });
    }

    if (!profile.google_calendar_access_token) {
      return res.status(400).json({ error: 'No access token found' });
    }

    // If sessionId provided, sync only that session (no lock needed)
    if (sessionId) {
      const { data: session } = await supabase
        .from('sessions')
        .select('tutor_id')
        .eq('id', sessionId)
        .maybeSingle();
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (session.tutor_id !== userId) return res.status(403).json({ error: 'Session does not belong to this tutor' });
      const syncResult = await syncSessionToGoogle(sessionId, userId);
      if (!syncResult.success) {
        return res.status(400).json({ success: false, error: syncResult.error });
      }
      return res.status(200).json({ success: true, synced: 'session' });
    }

    // Full sync: wait for any in-progress sync for this user, then run one
    let run: () => Promise<any> = () => syncAllEventsToGoogle(userId, profile);
    const existing = fullSyncLocks.get(userId);
    if (existing) {
      await existing;
    }
    const promise = run()
      .then((result) => {
        fullSyncLocks.delete(userId);
        return result;
      })
      .catch((err) => {
        fullSyncLocks.delete(userId);
        throw err;
      });
    fullSyncLocks.set(userId, promise);
    const result = await promise;

    return res.status(200).json({
      success: true,
      synced: result,
      sessionsCount: result.sessions,
      totalSessions: result.totalSessions,
      availabilityCreated: result.availabilityCreated,
      availabilityError: result.availabilityError,
      ...(result.sessionError && { sessionError: result.sessionError }),
    });
  } catch (err: any) {
    console.error('Sync error:', err);
    const message = err?.message || 'Internal server error';
    return res.status(500).json({ error: 'Internal server error', message });
  }
}
