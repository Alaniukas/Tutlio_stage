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
    const hasActiveLicenseRaw = req.body?.hasActiveLicense;
    const hasActiveLicense =
      typeof hasActiveLicenseRaw === 'boolean'
        ? hasActiveLicenseRaw
        : String(hasActiveLicenseRaw).toLowerCase() === 'true';

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
      return res.status(403).json({ error: 'Only organization admin can manage tutor licenses' });
    }
    const orgId = adminRow.organization_id;

    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .select('id, tutor_license_count, tutor_limit')
      .eq('id', orgId)
      .maybeSingle();

    if (orgErr || !org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Backwards-compat: older orgs used tutor_limit to mean license count.
    const licenseCount = Math.max(
      Number((org as any).tutor_license_count) || 0,
      Number((org as any).tutor_limit) || 0
    );
    if (licenseCount <= 0) {
      return res.status(400).json({ error: 'This organization does not use tutor licenses' });
    }

    const { data: tutorProfile, error: tutorErr } = await supabase
      .from('profiles')
      .select('id, organization_id, has_active_license')
      .eq('id', tutorId)
      .maybeSingle();

    if (tutorErr || !tutorProfile) {
      return res.status(404).json({ error: 'Tutor profile not found' });
    }

    if (tutorProfile.organization_id !== orgId) {
      return res.status(403).json({ error: 'Tutor does not belong to your organization' });
    }

    if (hasActiveLicense) {
      const { data: activeRows, error: activeErr } = await supabase
        .from('profiles')
        .select('id')
        .eq('organization_id', orgId)
        .neq('has_active_license', false);
      if (activeErr) {
        return res.status(500).json({ error: activeErr.message || 'Failed to check license usage' });
      }

      const currentlyActive = (activeRows || []).length;
      const alreadyActive = (tutorProfile as any).has_active_license !== false;
      const effectiveActive = currentlyActive + (alreadyActive ? 0 : 1);
      if (effectiveActive > licenseCount) {
        return res.status(409).json({ error: 'License limit reached' });
      }
    }

    const { error: updErr } = await supabase
      .from('profiles')
      .update({ has_active_license: hasActiveLicense })
      .eq('id', tutorId)
      .eq('organization_id', orgId);

    if (updErr) {
      return res.status(500).json({ error: updErr.message || 'Failed to update tutor license' });
    }

    return res.status(200).json({ success: true, tutorId, hasActiveLicense });
  } catch (err: any) {
    console.error('[org-set-tutor-license] Error:', err?.message || err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

