// ─── Vercel Cron: Cleanup old whiteboard data ─────────────────────────────────
// Runs hourly. Deletes whiteboard scene + image assets from storage for sessions
// that ended 2+ hours ago. PDFs exported to the session-files bucket are not
// affected — only the whiteboard-data bucket is cleaned.

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const CLEANUP_DELAY_MS = 2 * 60 * 60 * 1000; // 2 hours
const BATCH_SIZE = 50;

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
    const cutoff = new Date(Date.now() - CLEANUP_DELAY_MS).toISOString();

    const { data: sessions, error } = await supabase
      .from('sessions')
      .select('id')
      .in('status', ['completed', 'cancelled'])
      .lt('end_time', cutoff)
      .not('whiteboard_room_id', 'is', null)
      .eq('whiteboard_data_cleaned', false)
      .limit(BATCH_SIZE);

    if (error) {
      console.error('[cleanup-whiteboard] query error:', error);
      return res.status(500).json({ error: 'Database error', details: error.message });
    }

    if (!sessions || sessions.length === 0) {
      return res.status(200).json({ success: true, cleaned: 0 });
    }

    let cleaned = 0;
    const errors: string[] = [];

    for (const session of sessions) {
      try {
        // Collect all storage paths under this session's whiteboard folder
        const allPaths: string[] = [];

        const { data: topFiles } = await supabase.storage
          .from('whiteboard-data')
          .list(session.id, { limit: 200 });

        for (const f of topFiles || []) {
          if (f.id) allPaths.push(`${session.id}/${f.name}`);
        }

        const { data: subFiles } = await supabase.storage
          .from('whiteboard-data')
          .list(`${session.id}/files`, { limit: 1000 });

        for (const f of subFiles || []) {
          if (f.id) allPaths.push(`${session.id}/files/${f.name}`);
        }

        if (allPaths.length > 0) {
          const { error: deleteErr } = await supabase.storage
            .from('whiteboard-data')
            .remove(allPaths);

          if (deleteErr) {
            errors.push(`${session.id}: delete error - ${deleteErr.message}`);
            continue;
          }
        }

        await supabase
          .from('sessions')
          .update({ whiteboard_data_cleaned: true })
          .eq('id', session.id);

        cleaned++;
      } catch (err: any) {
        errors.push(`${session.id}: ${err.message}`);
      }
    }

    return res.status(200).json({
      success: true,
      cleaned,
      total: sessions.length,
      ...(errors.length > 0 ? { errors } : {}),
    });
  } catch (err: any) {
    console.error('[cleanup-whiteboard] error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
