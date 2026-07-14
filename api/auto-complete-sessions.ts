// ─── Vercel Cron: Auto-complete finished sessions ─────────────────────────────
// Runs periodically (e.g. every 5 min). Finds all active sessions whose
// end time has already passed and marks them as 'completed'.
//
// This enables clear statuses:
// - status = 'completed', paid = true  → Completed and paid
// - status = 'completed', paid = false → Completed and unpaid
//
// Configure Vercel cron to call GET /api/auto-complete-sessions.

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { syncSessionToGoogle } from './_lib/google-calendar.js';
import { requireCronAuth } from './_lib/cronAuth.js';
import {
  partitionByStatusConfirmation,
  movePackageCountersToCompleted,
} from './_lib/sessionStatusConfirmation.js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireCronAuth(req, res)) return;

  try {
    const now = new Date().toISOString();

    // Mark only sessions that:
    // - buvo aktyvios
    // - their end time has already passed
    // - are not yet marked as completed
    // - are not cancelled
    // Only look back 7 days — anything older is likely stale
    const lookback = new Date(Date.now() - 7 * 24 * 3600000).toISOString();
    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('id, tutor_id, end_time, status, paid, payment_status, lesson_package_id, subject_id')
      .eq('status', 'active')
      .lt('end_time', now)
      .gte('end_time', lookback)
      .limit(500);

    if (error) {
      console.error('[auto-complete-sessions] fetch error:', error);
      return res.status(500).json({ error: 'Database error', details: error.message });
    }

    if (!sessions || sessions.length === 0) {
      return res.status(200).json({ success: true, updated: 0 });
    }

    // Orgs with tutor_lesson_status_confirmation: their lessons stay 'active'
    // until the tutor explicitly confirms the outcome (/api/confirm-session-status).
    const { autoCompletable, awaitingConfirmation } = await partitionByStatusConfirmation(
      supabase,
      sessions as any[],
    );
    if (autoCompletable.length === 0) {
      return res.status(200).json({
        success: true,
        updated: 0,
        awaitingTutorConfirmation: awaitingConfirmation.length,
      });
    }
    const completableSessions = autoCompletable as any[];

    const idsToComplete = completableSessions.map((s: any) => s.id);

    const { error: updateErr } = await supabase
      .from('sessions')
      .update({ status: 'completed' })
      .in('id', idsToComplete);

    if (updateErr) {
      console.error('[auto-complete-sessions] update error:', updateErr);
      return res.status(500).json({ error: 'Update error', details: updateErr.message });
    }

    // Sync completed sessions to Google Calendar (background, best-effort)
    const tutorSessionMap = new Map<string, string[]>();
    for (const s of completableSessions) {
      const tutorId = (s as any).tutor_id as string;
      if (!tutorId) continue;
      const arr = tutorSessionMap.get(tutorId) || [];
      arr.push(s.id);
      tutorSessionMap.set(tutorId, arr);
    }
    for (const [tutorId, sessionIds] of tutorSessionMap) {
      for (const sid of sessionIds.slice(0, 20)) {
        syncSessionToGoogle(sid, tutorId).catch((err) => {
          console.error('[auto-complete-sessions] Google sync failed:', sid, err);
        });
      }
    }

    // Update lesson packages: move from reserved to completed (batch optimized).
    // For multi-subject packages, the per-subject item counters are also moved.
    const packagesUpdated = await movePackageCountersToCompleted(supabase, completableSessions);
    if (packagesUpdated > 0) {
      console.log(`[auto-complete-sessions] Batch updated ${packagesUpdated} packages + items`);
    }

    // Remove waitlist entries for completed sessions
    const { error: waitlistDeleteErr, count: waitlistDeleted } = await supabase
      .from('waitlists')
      .delete({ count: 'exact' })
      .in('session_id', idsToComplete);

    if (waitlistDeleteErr) {
      console.error('[auto-complete-sessions] waitlist cleanup error:', waitlistDeleteErr);
    } else {
      console.log(`[auto-complete-sessions] Removed ${waitlistDeleted || 0} waitlist entries for completed sessions`);
    }

    // Optional cleanup: remove old generic waitlist entries (older than 30 days)
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 30);
    const { error: oldWaitlistErr, count: oldWaitlistDeleted } = await supabase
      .from('waitlists')
      .delete({ count: 'exact' })
      .is('session_id', null)
      .lt('created_at', oldDate.toISOString());

    if (oldWaitlistErr) {
      console.error('[auto-complete-sessions] old waitlist cleanup error:', oldWaitlistErr);
    } else if (oldWaitlistDeleted && oldWaitlistDeleted > 0) {
      console.log(`[auto-complete-sessions] Cleaned up ${oldWaitlistDeleted} old generic waitlist entries`);
    }

    return res.status(200).json({
      success: true,
      updated: idsToComplete.length,
      awaitingTutorConfirmation: awaitingConfirmation.length,
      packagesUpdated,
      waitlistEntriesRemoved: (waitlistDeleted || 0) + (oldWaitlistDeleted || 0)
    });
  } catch (err: any) {
    console.error('[auto-complete-sessions] error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}

