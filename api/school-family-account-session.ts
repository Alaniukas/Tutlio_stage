import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from './types';
import { verifyRequestAuth } from './_lib/auth.js';

/** Records the first observed login separately from invitation/activation. Never grants access. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const auth = await verifyRequestAuth(req);
  if (!auth?.userId || auth.isInternal) return res.status(401).json({ error: 'Unauthorized' });
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(500).json({ error: 'server_not_configured' });
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const result = await db.from('school_family_accounts').update({ first_login_at: new Date().toISOString() })
    .eq('user_id', auth.userId).is('first_login_at', null);
  // Legacy accounts/rolling deploys can log in without this optional audit table.
  return res.status(200).json({ success: !result.error });
}
