import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
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

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser(accessToken);
    const requester = userData?.user;
    if (userErr || !requester) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const adminAccess = await getOrgAdminAccessByUserId(supabase, requester.id);
    if (!adminAccess || !hasOrgAdminPermission(adminAccess.role, adminAccess.permissions, 'tutors.view')) {
      return res.status(403).json({ error: 'Only organization admin can view license info' });
    }
    const adminRow = { organization_id: adminAccess.organizationId };

    const orgId = adminRow.organization_id;

    const { data: org, error: orgErr } = await supabase
      .from('organizations')
      .select('id, tutor_license_count, license_subscription_id, license_subscription_status, license_subscription_period_end')
      .eq('id', orgId)
      .maybeSingle();

    if (orgErr || !org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    return res.status(200).json({
      organizationId: orgId,
      tutorLicenseCount: Number((org as any).tutor_license_count) || 0,
      hasLicenseSubscription: Boolean((org as any).license_subscription_id),
      licenseSubscriptionStatus: (org as any).license_subscription_status || null,
      licenseSubscriptionPeriodEnd: (org as any).license_subscription_period_end || null,
    });
  } catch (err: any) {
    console.error('[org-license-info] Error:', err?.message || err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
