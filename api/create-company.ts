// ─── Vercel Serverless Function: Create Organization + Admin ────────────────
// POST /api/create-company
// Used by Tutlio Admin panel to create a new organization and its first admin.
// Mirrors the dev-only middleware implementation in vite.config.ts.

import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { timingSafeEqual } from 'crypto';

function getPlatformAdminSecret(): string {
  const s = process.env.ADMIN_SECRET || process.env.VITE_ADMIN_SECRET;
  return (s && String(s).trim()) || '';
}

function secretsMatch(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const adminSecret = getPlatformAdminSecret();

    const secret = typeof req.headers['x-admin-secret'] === 'string' ? req.headers['x-admin-secret'] : '';
    if (!adminSecret || !secret || !secretsMatch(secret, adminSecret)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!serviceKey || !supabaseUrl) {
      return res.status(500).json({ error: 'Missing Supabase env vars' });
    }

    const { orgName, orgEmail, tutorLicenseCount, adminEmail, adminPassword } = req.body as any;

    if (!orgName || !adminEmail || !adminPassword) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: adminEmail,
      password: adminPassword,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      return res.status(400).json({ error: authError?.message || 'Failed to create user' });
    }

    const userId = authData.user.id;

    try {
      // 2. Create organization
      const licenseCount = Math.max(0, Number(tutorLicenseCount) || 0);
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({
          name: orgName,
          email: orgEmail || null,
          tutor_license_count: licenseCount,
          // Legacy column kept for backwards-compat; do not enforce tutor count limits.
          tutor_limit: 9999,
        })
        .select('id')
        .single();

      if (orgError || !org) {
        await supabase.auth.admin.deleteUser(userId);
        return res.status(500).json({ error: orgError?.message || 'Failed to create organization' });
      }

      // 3. Create profile with organization_id
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(
          {
            id: userId,
            email: adminEmail,
            full_name: orgName + ' Admin',
            organization_id: org.id,
          },
          { onConflict: 'id' }
        );

      if (profileError) {
        await supabase.auth.admin.deleteUser(userId);
        await supabase.from('organizations').delete().eq('id', org.id);
        return res.status(500).json({ error: profileError.message });
      }

      // 4. Link user as org admin
      const { error: adminError } = await supabase
        .from('organization_admins')
        .insert({ user_id: userId, organization_id: org.id });

      if (adminError) {
        await supabase.auth.admin.deleteUser(userId);
        await supabase.from('organizations').delete().eq('id', org.id);
        return res.status(500).json({ error: adminError.message });
      }

      const { error: auditErr } = await supabase.from('platform_admin_audit').insert({
        action: 'organization.create',
        organization_id: org.id,
        details: {
          orgName,
          orgEmail: orgEmail || null,
          tutorLicenseCount: licenseCount,
          adminEmail,
        },
      });
      if (auditErr) console.warn('[create-company] platform_admin_audit insert failed (run migrations?):', auditErr.message);

      return res.status(200).json({ success: true, organizationId: org.id, userId });
    } catch (err: any) {
      // Rollback user if anything unexpected happens
      await supabase.auth.admin.deleteUser(userId);
      return res.status(500).json({ error: err?.message || 'Unknown error' });
    }
  } catch (err: any) {
    console.error('[create-company] Error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err?.message });
  }
}

