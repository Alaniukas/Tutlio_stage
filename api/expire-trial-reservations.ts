// ─── Vercel Cron: Auto-release expired reservations ───────────────────────────
// Pro Klase intake funnel, Phase 1 req 2 (trial holds) + Phase 2 req 3/5
// (package pre-book holds — both share the same soft-hold shape).
//
// Finds soft-holds (payment_status='reserved', status='active') whose
// reservation_expires_at has passed and whose linked package is still unpaid,
// then cancels the session (freeing the slot) and deactivates the unpaid
// package. A hold whose package was already paid (e.g. a late webhook) is left
// untouched as a safety net.
//
// Configure Vercel cron to call GET /api/expire-trial-reservations.
import type { VercelRequest, VercelResponse } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@supabase/supabase-js';
import { requireCronAuth } from './_lib/cronAuth.js';
import { deleteSessionFromGoogle } from './_lib/google-calendar.js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export interface ReleaseExpiredReservationsResult {
  released: number;
  packagesExpired: number;
}

/**
 * Core auto-release logic, extracted from the handler so it can be exercised by
 * the intake-funnel smoke test against an in-memory store. Cancels expired
 * unpaid soft-holds (trial + package) and deactivates their unpaid packages,
 * leaving holds whose package was already paid untouched. Throws on hard
 * Supabase errors so the caller can map them to a 500.
 */
export async function releaseExpiredReservations(
  supabase: SupabaseClient,
  opts: { now?: Date } = {},
): Promise<ReleaseExpiredReservationsResult> {
  const now = (opts.now ?? new Date()).toISOString();

  const { data: holds, error } = await supabase
    .from('sessions')
    .select('id, tutor_id, lesson_package_id, start_time')
    .eq('payment_status', 'reserved')
    .eq('status', 'active')
    .not('reservation_expires_at', 'is', null)
    .lt('reservation_expires_at', now)
    .limit(500);

  if (error) throw new Error(error.message);
  if (!holds || holds.length === 0) return { released: 0, packagesExpired: 0 };

  // Never release a hold whose package was already paid (late webhook / race).
  const pkgIds = [...new Set(holds.map((h: any) => h.lesson_package_id).filter(Boolean))] as string[];
  const paidPkgIds = new Set<string>();
  if (pkgIds.length > 0) {
    const { data: pkgs } = await supabase.from('lesson_packages').select('id, paid').in('id', pkgIds);
    for (const p of pkgs || []) if ((p as any).paid === true) paidPkgIds.add((p as any).id);
  }

  const toRelease = holds.filter(
    (h: any) => !h.lesson_package_id || !paidPkgIds.has(h.lesson_package_id),
  );
  if (toRelease.length === 0) return { released: 0, packagesExpired: 0 };

  const sessionIds = toRelease.map((h: any) => h.id);

  // Cancel the held sessions. Slot frees automatically (the underlying tutor
  // availability still exists). cancelled_by stays NULL — this is automatic.
  const { error: cancelErr } = await supabase
    .from('sessions')
    .update({
      status: 'cancelled',
      payment_status: 'expired',
      cancellation_reason: 'Rezervacija nebuvo apmokėta laiku',
      cancelled_at: now,
    })
    .in('id', sessionIds);

  if (cancelErr) throw new Error(cancelErr.message);

  for (const h of toRelease) {
    deleteSessionFromGoogle((h as any).id, (h as any).tutor_id).catch(() => {});
  }

  // Deactivate the still-unpaid packages behind the released holds.
  const releasePkgIds = [...new Set(toRelease.map((h: any) => h.lesson_package_id).filter(Boolean))] as string[];
  if (releasePkgIds.length > 0) {
    await supabase
      .from('lesson_packages')
      .update({ active: false, payment_status: 'expired' })
      .in('id', releasePkgIds)
      .eq('paid', false);
  }

  return { released: sessionIds.length, packagesExpired: releasePkgIds.length };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireCronAuth(req, res)) return;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  try {
    const result = await releaseExpiredReservations(supabase);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[expire-trial-reservations] error:', err);
    return res.status(500).json({ error: err?.message || String(err) });
  }
}
