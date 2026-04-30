import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const auth = await verifyRequestAuth(req);
  if (!auth?.userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!supabaseUrl || !serviceKey) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const sb = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (req.method === 'DELETE') {
    const { endpoint } = req.body || {};
    if (!endpoint) return res.status(400).json({ error: 'endpoint required' });

    await sb
      .from('push_subscriptions')
      .delete()
      .eq('user_id', auth.userId)
      .eq('endpoint', endpoint);

    return res.status(200).json({ ok: true });
  }

  const { endpoint, p256dh, auth: authKey } = req.body || {};
  if (!endpoint || !p256dh || !authKey) {
    return res.status(400).json({ error: 'endpoint, p256dh, auth required' });
  }

  const { error } = await sb.from('push_subscriptions').upsert(
    { user_id: auth.userId, endpoint, p256dh, auth_key: authKey },
    { onConflict: 'user_id,endpoint' },
  );

  if (error) {
    console.error('[save-push-subscription]', error.message);
    return res.status(500).json({ error: 'Failed to save subscription' });
  }

  return res.status(200).json({ ok: true });
}
