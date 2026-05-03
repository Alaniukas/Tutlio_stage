import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return res.status(500).json({ error: 'Missing Supabase env vars' });
    }

    const token = String(req.body?.token || '').trim().toUpperCase();
    if (!token) {
      return res.status(400).json({ valid: false, error: 'Missing token' });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: invite, error } = await supabase
      .from('tutor_invites')
      .select('id, used, organization_id, organizations(name)')
      .eq('token', token)
      .maybeSingle();

    if (error || !invite) {
      return res.status(200).json({ valid: false });
    }

    if (invite.used) {
      return res.status(200).json({ valid: false, used: true });
    }

    return res.status(200).json({
      valid: true,
      inviteId: invite.id,
      organizationId: invite.organization_id,
      orgName: (invite.organizations as any)?.name || null,
    });
  } catch (err: any) {
    console.error('[validate-tutor-invite] Error:', err?.message || err);
    return res.status(500).json({ valid: false, error: 'Internal server error' });
  }
}
