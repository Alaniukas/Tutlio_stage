import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const ANALYTICS_RETENTION_DAYS = 90;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
    if (auth !== `Bearer ${cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const now = new Date().toISOString();

  const { data: expired, error } = await supabase
    .from('lesson_packages')
    .update({ active: false, payment_status: 'expired' })
    .eq('active', true)
    .not('expires_at', 'is', null)
    .lt('expires_at', now)
    .select('id');

  if (error) {
    console.error('expire-packages error:', error);
    return res.status(500).json({ error: error.message });
  }

  // Prune analytics_events older than retention window to bound table growth
  const cutoff = new Date(Date.now() - ANALYTICS_RETENTION_DAYS * 86_400_000).toISOString();
  const { count: analyticsDeleted, error: analyticsErr } = await supabase
    .from('analytics_events')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff);

  if (analyticsErr) {
    console.error('expire-packages analytics cleanup error:', analyticsErr);
  }

  return res.status(200).json({
    expired: expired?.length ?? 0,
    analytics_pruned: analyticsDeleted ?? 0,
  });
}
