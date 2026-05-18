import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';

function getPlatformAdminSecret(): string {
  const s = process.env.ADMIN_SECRET || process.env.VITE_ADMIN_SECRET;
  return (s && String(s).trim()) || '';
}

function verifyAdmin(req: VercelRequest): boolean {
  const expected = getPlatformAdminSecret();
  if (!expected) return false;
  const header = req.headers['x-admin-secret'];
  const provided = typeof header === 'string' ? header : '';
  if (!provided || provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!verifyAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('enterprise_contacts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('admin-enterprise-contacts error:', error);
      return res.status(500).json({ error: 'Failed to fetch contacts' });
    }

    return res.status(200).json({ contacts: data || [] });
  } catch (err) {
    console.error('admin-enterprise-contacts error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
