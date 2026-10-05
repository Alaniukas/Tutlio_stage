import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from './types';
import { requireCronAuth } from './_lib/cronAuth.js';
import { retryPendingStaffConsentPdfs } from './_lib/schoolStaffConsentPdf.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireCronAuth(req, res)) return;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(500).json({ error: 'Server misconfigured' });
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const pendingPdfs = await retryPendingStaffConsentPdfs(supabase, 8);
  return res.status(200).json({ ok: true, ...pendingPdfs });
}
