import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from './types';
import { requireCronAuth } from './_lib/cronAuth.js';
import { publicOriginFromRequest } from './_lib/public-origin.js';
import { reconcileInProgressContractSignatures } from './_lib/schoolContractSigningReconcile.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireCronAuth(req, res)) return;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const appOrigin = (
    process.env.APP_URL ||
    process.env.VITE_APP_URL ||
    publicOriginFromRequest(req)
  ).replace(/\/$/, '');

  try {
    const result = await reconcileInProgressContractSignatures(supabase, appOrigin);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[school-contract-sign-reconcile] cron failed:', message);
    return res.status(500).json({ error: message });
  }
}
