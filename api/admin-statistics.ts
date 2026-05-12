// GET /api/admin-statistics — aggregated analytics for the platform admin panel.
// Requires x-admin-secret header.
import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { supabaseServiceRoleClientOptions } from './_lib/supabaseServiceRoleClientOptions.js';

function getPlatformAdminSecret(): string {
  const s = process.env.ADMIN_SECRET || process.env.VITE_ADMIN_SECRET;
  return (s && String(s).trim()) || '';
}

function secretsMatch(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, supabaseServiceRoleClientOptions() as any) as any;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const adminSecret = getPlatformAdminSecret();
  const secret = typeof req.headers['x-admin-secret'] === 'string' ? req.headers['x-admin-secret'] : '';
  if (!adminSecret || !secret || !secretsMatch(secret, adminSecret)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sb = getSupabase();
  if (!sb) return res.status(503).json({ error: 'Database not configured' });

  const daysBack = Math.min(Number(req.query.days) || 90, 365);
  const since = new Date(Date.now() - daysBack * 86400_000).toISOString();

  try {
    const [
      localeRes,
      signupRes,
      trafficRes,
      topPagesRes,
      pageviewCountRes,
      uniqueSessionsRes,
    ] = await Promise.all([
      // Locale distribution from profiles
      sb.rpc('admin_stats_locale_distribution'),

      // Signup trends (weekly)
      sb.rpc('admin_stats_signup_trends', { since_date: since }),

      // Traffic sources from analytics_events
      sb.rpc('admin_stats_traffic_sources', { since_date: since }),

      // Top pages from analytics_events
      sb.rpc('admin_stats_top_pages', { since_date: since }),

      // Total pageviews in period
      sb.from('analytics_events')
        .select('id', { count: 'exact', head: true })
        .eq('event_name', 'pageview')
        .gte('created_at', since),

      // Unique sessions in period
      sb.from('analytics_events')
        .select('session_id')
        .eq('event_name', 'pageview')
        .gte('created_at', since),
    ]);

    const uniqueSessions = new Set(
      (uniqueSessionsRes.data || []).map((r: any) => r.session_id)
    ).size;

    return res.status(200).json({
      period_days: daysBack,
      total_pageviews: pageviewCountRes.count ?? 0,
      unique_sessions: uniqueSessions,
      locale_distribution: localeRes.data || [],
      signup_trends: signupRes.data || [],
      traffic_sources: trafficRes.data || [],
      top_pages: topPagesRes.data || [],
    });
  } catch (err: any) {
    console.error('[admin-statistics] Error:', err);
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
}
