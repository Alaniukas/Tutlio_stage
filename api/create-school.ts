// POST /api/create-school — platform admin: create school org + first admin (mirrors create-company).

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

    const { schoolName, schoolEmail, adminEmail, adminPassword } = req.body as {
      schoolName?: string;
      schoolEmail?: string;
      adminEmail?: string;
      adminPassword?: string;
    };

    if (!schoolName?.trim() || !schoolEmail?.trim() || !adminEmail?.trim() || !adminPassword) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: orgRow, error: orgErr } = await supabase
      .from('organizations')
      .insert({
        name: schoolName.trim(),
        email: schoolEmail.trim(),
        status: 'active',
        entity_type: 'school',
      })
      .select('id')
      .single();

    if (orgErr || !orgRow) {
      return res.status(500).json({ error: orgErr?.message || 'Failed to create school' });
    }

    const orgId = orgRow.id;

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: adminEmail.trim(),
      password: adminPassword,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      await supabase.from('organizations').delete().eq('id', orgId);
      return res.status(400).json({ error: authError?.message || 'Failed to create user' });
    }

    const userId = authData.user.id;

    try {
      const { error: profileError } = await supabase.from('profiles').upsert(
        {
          id: userId,
          email: adminEmail.trim(),
          full_name: `${schoolName.trim()} — administratorius`,
          organization_id: orgId,
        },
        { onConflict: 'id' },
      );

      if (profileError) {
        await supabase.auth.admin.deleteUser(userId);
        await supabase.from('organizations').delete().eq('id', orgId);
        return res.status(500).json({ error: profileError.message });
      }

      const { error: adminError } = await supabase
        .from('organization_admins')
        .insert({ user_id: userId, organization_id: orgId });

      if (adminError) {
        await supabase.auth.admin.deleteUser(userId);
        await supabase.from('organizations').delete().eq('id', orgId);
        return res.status(500).json({ error: adminError.message });
      }

      const { error: auditErr } = await supabase.from('platform_admin_audit').insert({
        action: 'school.create',
        details: {
          schoolName: schoolName.trim(),
          schoolEmail: schoolEmail.trim(),
          adminEmail: adminEmail.trim(),
          schoolId: orgId,
        },
      });
      if (auditErr) console.warn('[create-school] platform_admin_audit insert failed:', auditErr.message);

      return res.status(200).json({ success: true, schoolId: orgId, userId });
    } catch (err: any) {
      await supabase.auth.admin.deleteUser(userId);
      await supabase.from('organizations').delete().eq('id', orgId);
      return res.status(500).json({ error: err?.message || 'Unknown error' });
    }
  } catch (err: any) {
    console.error('[create-school] Error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err?.message });
  }
}
