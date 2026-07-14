import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';

async function authenticatedUserId(req: VercelRequest): Promise<string | null> {
  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await sb.auth.getUser(token);
  return error ? null : data.user?.id || null;
}

function randomToken() {
  return `${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const userId = await authenticatedUserId(req);
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return res.status(500).json({ error: 'Server misconfigured' });
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const contractId = typeof req.body?.contractId === 'string' ? req.body.contractId : '';
  if (!contractId) return res.status(400).json({ error: 'Missing contractId' });

  const { data: contract } = await supabase
    .from('school_contracts')
    .select('organization_id')
    .eq('id', contractId)
    .maybeSingle();
  if (!contract?.organization_id) return res.status(404).json({ error: 'Contract not found' });
  const { data: admin } = await supabase
    .from('organization_admins')
    .select('id')
    .eq('user_id', userId)
    .eq('organization_id', contract.organization_id)
    .maybeSingle();
  if (!admin) return res.status(403).json({ error: 'Forbidden' });

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
