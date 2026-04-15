/**
 * POST /api/apply-manual-subscription-exempt
 * Authenticated tutor enters a secret key (Vercel env); server sets profiles.manual_subscription_exempt.
 * Env: MANUAL_SUBSCRIPTION_BYPASS_SECRET (tik serveris, ne VITE_*).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function secretsEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const expected = (process.env.MANUAL_SUBSCRIPTION_BYPASS_SECRET || '').trim();
  if (!expected) {
    return res.status(503).json({ error: 'MANUAL_SUBSCRIPTION_BYPASS_SECRET not configured' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Neautorizuota' });
  }

  let body: { secret?: string };
  try {
    const raw = req.body;
    body = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {};
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const secret = typeof body?.secret === 'string' ? body.secret : '';
  if (!secret || !secretsEqual(secret, expected)) {
    return res.status(401).json({ error: 'Neteisingas raktas' });
  }

  try {
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user?.id) {
      return res.status(401).json({ error: 'Neautorizuota' });
    }

    const { error: updError } = await supabase
      .from('profiles')
      .update({ manual_subscription_exempt: true })
      .eq('id', user.id);

    if (updError) {
      console.error('apply-manual-subscription-exempt:', updError);
      return res.status(500).json({ error: updError.message || 'Nepavyko atnaujinti profilio' });
    }

    return res.status(200).json({ ok: true, manual_subscription_exempt: true });
  } catch (e: any) {
    console.error('apply-manual-subscription-exempt:', e);
    return res.status(500).json({ error: e?.message || 'Serverio klaida' });
  }
}
