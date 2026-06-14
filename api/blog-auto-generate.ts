import type { VercelRequest, VercelResponse } from './types.js';
import { createClient } from '@supabase/supabase-js';
import { requireCronAuth } from './_lib/cronAuth.js';
import { supabaseServiceRoleClientOptions } from './_lib/supabaseServiceRoleClientOptions.js';
import { runBlogAutoGenerate } from './_lib/blogAutoGenerate.js';
import { publicOriginFromRequest } from './_lib/public-origin.js';

function getSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, supabaseServiceRoleClientOptions() as any);
}

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!requireCronAuth(req, res)) return;

  const supabase = getSupabase();
  if (!supabase) return res.status(503).json({ error: 'Database not configured' });

  const appOrigin = publicOriginFromRequest(req);
  const result = await runBlogAutoGenerate(supabase as any, { appOrigin });

  if (!result.ok && result.reason) {
    return res.status(500).json(result);
  }

  return res.status(200).json(result);
}
