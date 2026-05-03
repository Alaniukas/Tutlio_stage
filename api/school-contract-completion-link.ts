import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';

async function isAuthenticatedUser(req: VercelRequest): Promise<boolean> {
  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  if (!authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await sb.auth.getUser(token);
  return !error;
}

function randomToken() {
  return `${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await isAuthenticatedUser(req))) return res.status(401).json({ error: 'Unauthorized' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return res.status(500).json({ error: 'Server misconfigured' });
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const contractId = typeof req.body?.contractId === 'string' ? req.body.contractId : '';
  if (!contractId) return res.status(400).json({ error: 'Missing contractId' });

  const token = randomToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  const { error } = await supabase.from('school_contract_completion_tokens').insert({
    contract_id: contractId,
    token,
    expires_at: expiresAt,
  });
  if (error) return res.status(500).json({ error: error.message });

  const host = typeof req.headers.host === 'string' ? req.headers.host : '';
  const protoHeader = typeof req.headers['x-forwarded-proto'] === 'string'
    ? req.headers['x-forwarded-proto']
    : Array.isArray(req.headers['x-forwarded-proto'])
      ? req.headers['x-forwarded-proto'][0]
      : '';
  const inferredAppUrl = host ? `${protoHeader || 'https'}://${host}` : '';
  const appUrl = process.env.APP_URL || process.env.VITE_APP_URL || inferredAppUrl || 'https://tutlio.lt';
  const completionUrl = `${appUrl.replace(/\/$/, '')}/school-contract-complete?token=${encodeURIComponent(token)}`;
  return res.status(200).json({ completionUrl });
}

