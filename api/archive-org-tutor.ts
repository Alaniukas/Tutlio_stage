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

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const accessToken = authHeader.replace('Bearer ', '');

    const tutorId = String(req.body?.tutorId || '').trim();
    if (!tutorId) {
      return res.status(400).json({ error: 'Missing tutorId' });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
    const requester = userData?.user;
    if (userErr || !requester) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: adminRow, error: adminErr } = await supabase
      .from('organization_admins')
      .select('organization_id')
      .eq('user_id', requester.id)
      .maybeSingle();

    if (adminErr || !adminRow?.organization_id) {
      return res.status(403).json({ error: 'Only organization admin can archive tutors' });
    }

    const orgId = adminRow.organization_id;

    const { data: tutorProfile, error: tutorErr } = await supabase
      .from('profiles')
      .select('id, organization_id')
      .eq('id', tutorId)
      .maybeSingle();

    if (tutorErr || !tutorProfile) {
      return res.status(404).json({ error: 'Tutor profile not found' });
    }

    if (tutorProfile.organization_id !== orgId) {
      return res.status(403).json({ error: 'Tutor does not belong to your organization' });
    }

    // Keep all historical data, but detach active ownership:
    // 1) students become unassigned (still visible to org admin through organization_id)
    await supabase
      .from('students')
      .update({ tutor_id: null })
      .eq('organization_id', orgId)
      .eq('tutor_id', tutorId);

    // 2) tutor is detached from organization so org admin lists no longer include this tutor
    await supabase
      .from('profiles')
      .update({ organization_id: null })
      .eq('id', tutorId);

    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('[archive-org-tutor] Error:', err?.message || err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
