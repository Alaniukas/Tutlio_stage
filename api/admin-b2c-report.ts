// GET /api/admin-b2c-report?month=YYYY-MM
// Monthly B2C fee summary CSV for accounting (Stripe: platform_fee_ledger,
// Perlas: perlas_ledger). The actual sąskaitos faktūros are issued per
// counterparty via /api/admin-b2c-invoices.
// Requires x-admin-secret header (same pattern as admin-statistics).
import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';
import { supabaseServiceRoleClientOptions } from './_lib/supabaseServiceRoleClientOptions.js';
import { monthRangeUtc, summarizeB2cMonth, b2cSummaryCsv } from './_lib/b2cReport.js';

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
  return createClient(url, key, supabaseServiceRoleClientOptions() as any);
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

  const month = typeof req.query.month === 'string' ? req.query.month : '';
  const range = monthRangeUtc(month);
  if (!range) return res.status(400).json({ error: 'Invalid month, expected YYYY-MM' });

  try {
    const [stripeRes, perlasRes] = await Promise.all([
      sb
        .from('platform_fee_ledger')
        .select('platform_fee, gross_amount')
        .gte('paid_at', range.startIso)
        .lt('paid_at', range.endIso),
      sb
        .from('perlas_ledger')
        .select('platform_fee, perlas_fee, volume')
        .gte('created_at', range.startIso)
        .lt('created_at', range.endIso),
    ]);

    if (stripeRes.error) throw stripeRes.error;
    if (perlasRes.error) throw perlasRes.error;

    const summary = summarizeB2cMonth({
      month,
      stripeRows: stripeRes.data || [],
      perlasRows: perlasRes.data || [],
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="tutlio-b2c-suvestine-${month}.csv"`);
    return res.status(200).send(b2cSummaryCsv(summary));
  } catch (err: any) {
    console.error('[admin-b2c-report] Error:', err);
    return res.status(500).json({ error: err?.message || 'Internal server error' });
  }
}
