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

    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const fullName = String(req.body?.fullName || '').trim();
    const phone = String(req.body?.phone || '').trim();
    const orgToken = String(req.body?.orgToken || '').trim().toUpperCase();
    const acceptedAt = req.body?.acceptedAt || null;

    if (!email || !password || !fullName || !orgToken) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: invite, error: inviteErr } = await supabase
      .from('tutor_invites')
      .select('id, used')
      .eq('token', orgToken)
      .maybeSingle();

    if (inviteErr || !invite || invite.used) {
      return res.status(400).json({ error: 'Invitation code is invalid or already used.' });
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        phone: phone || '',
        org_token: orgToken,
        accepted_privacy_policy_at: acceptedAt,
        accepted_terms_at: acceptedAt,
      },
    });

    if (authError || !authData.user) {
      return res.status(400).json({ error: authError?.message || 'Failed to create user' });
    }

    return res.status(200).json({ success: true, userId: authData.user.id });
  } catch (err: any) {
    console.error('[register-tutor-invite] Error:', err?.message || err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
