import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body: Record<string, unknown>;
  try {
    const raw = req.body;
    body = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw || {};
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const email = String(body.email || '').trim().toLowerCase();
  const source = String(body.source || 'landing_integrations').trim();

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  try {
    const supabase = getSupabase();

    const { data: existing } = await supabase
      .from('landing_leads')
      .select('id')
      .eq('email', email)
      .limit(1)
      .maybeSingle();

    if (existing) {
      return res.status(200).json({ success: true, duplicate: true });
    }

    const { error: dbError } = await supabase.from('landing_leads').insert({
      email,
      source,
    });

    if (dbError) {
      console.error('landing_leads insert error:', dbError);
      return res.status(500).json({ error: 'Failed to save lead' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('landing-lead error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
