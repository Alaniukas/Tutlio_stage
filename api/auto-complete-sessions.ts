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

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

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

    const idsToComplete = sessions.map((s: any) => s.id);

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
    for (const s of sessions) {
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
    const sessionsWithPackages = (sessions as any[]).filter((s) => s.lesson_package_id);
    const packageIds = [...new Set(sessionsWithPackages.map((s) => s.lesson_package_id))] as string[];

    if (packageIds.length > 0) {
      // 1. Update per-subject items first
      const { data: items } = await supabase
        .from('lesson_package_items')
        .select('id, package_id, subject_id, reserved_lessons, completed_lessons')
        .in('package_id', packageIds);

      if (items && items.length > 0) {
        for (const it of items as any[]) {
          const completedCount = sessionsWithPackages.filter(
            (s) => s.lesson_package_id === it.package_id && s.subject_id === it.subject_id,
          ).length;
          if (completedCount > 0) {
            await supabase
              .from('lesson_package_items')
              .update({
                reserved_lessons: Math.max(0, Number(it.reserved_lessons || 0) - completedCount),
                completed_lessons: Number(it.completed_lessons || 0) + completedCount,
              })
              .eq('id', it.id);
          }
        }
      }

      // 2. Update parent package aggregates
      const { data: packages } = await supabase
        .from('lesson_packages')
        .select('id, reserved_lessons, completed_lessons')
        .in('id', packageIds);

      if (packages && packages.length > 0) {
        const updates = packages.map(pkg => {
          const completedCount = sessionsWithPackages.filter((s) => s.lesson_package_id === pkg.id).length;
          return {
            id: pkg.id,
            reserved_lessons: Math.max(0, pkg.reserved_lessons - completedCount),
            completed_lessons: pkg.completed_lessons + completedCount,
          };
        });

        for (const update of updates) {
          await supabase
            .from('lesson_packages')
            .update({
              reserved_lessons: update.reserved_lessons,
              completed_lessons: update.completed_lessons,
            })
            .eq('id', update.id);
        }

        console.log(`[auto-complete-sessions] Batch updated ${updates.length} packages + items`);
      }
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
      packagesUpdated: packageIds.length,
      waitlistEntriesRemoved: (waitlistDeleted || 0) + (oldWaitlistDeleted || 0)
    });
  } catch (err: any) {
    console.error('[auto-complete-sessions] error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}

