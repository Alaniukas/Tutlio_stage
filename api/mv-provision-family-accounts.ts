import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import { provisionMvFamilyAccounts } from './_lib/mvProvisionFamilyAccounts.js';
import { publicOriginFromRequest } from './_lib/public-origin.js';

function parseJsonBody(req: VercelRequest): Record<string, unknown> {
  const raw = req.body;
  if (raw == null) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (Buffer.isBuffer(raw)) {
    try {
      return JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  return {};
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const auth = await verifyRequestAuth(req);
    if (!auth || auth.isInternal || !auth.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).json({ error: 'Missing Supabase service env vars' });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = parseJsonBody(req);
    const studentId = typeof body.studentId === 'string' ? body.studentId : '';
    const parentName = typeof body.parentName === 'string' ? body.parentName : undefined;
    const parentEmail = typeof body.parentEmail === 'string' ? body.parentEmail : undefined;
    const studentFullName = typeof body.studentFullName === 'string' ? body.studentFullName : undefined;
    const studentEmail = typeof body.studentEmail === 'string' ? body.studentEmail : undefined;
    const locale = typeof body.locale === 'string' ? body.locale : undefined;
    const scopeRaw = typeof body.scope === 'string' ? body.scope : 'auto';
    const scope =
      scopeRaw === 'both' || scopeRaw === 'parent' || scopeRaw === 'student' || scopeRaw === 'auto'
        ? scopeRaw
        : 'auto';
    const emailDeliveryRaw = typeof body.emailDelivery === 'string' ? body.emailDelivery : 'separate';
    const emailDelivery = emailDeliveryRaw === 'parent_both' ? 'parent_both' : 'separate';
    const parentNotifyEmail =
      typeof body.parentNotifyEmail === 'string' ? body.parentNotifyEmail : undefined;
    const studentNotifyEmail =
      typeof body.studentNotifyEmail === 'string' ? body.studentNotifyEmail : undefined;
    const bothNotifyEmail = typeof body.bothNotifyEmail === 'string' ? body.bothNotifyEmail : undefined;

    if (!studentId) return res.status(400).json({ error: 'studentId is required' });

    const { data: student, error: stErr } = await supabase
      .from('students')
      .select('organization_id, tutor_id')
      .eq('id', studentId)
      .maybeSingle();

    if (stErr || !student) return res.status(404).json({ error: 'Student not found' });

    let organizationId = (student.organization_id as string | null) ?? null;
    const tutorId = student.tutor_id as string | null;
    if (!organizationId && tutorId) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', tutorId)
        .maybeSingle();
      organizationId = (prof?.organization_id as string | null) ?? null;
    }

    let allowed = false;
    if (tutorId && tutorId === auth.userId) allowed = true;
    if (!allowed && organizationId) {
      const adminAccess = await getOrgAdminAccessByUserId(supabase, auth.userId);
      if (
        adminAccess?.organizationId === organizationId
        && hasOrgAdminPermission(adminAccess.role, adminAccess.permissions, 'students.edit')
      ) {
        allowed = true;
      }
    }

    if (!allowed) {
      return res.status(403).json({ error: 'Forbidden: org admin students.edit required' });
    }

    const result = await provisionMvFamilyAccounts(supabase, {
      studentId,
      parentName,
      parentEmail,
      studentFullName,
      studentEmail,
      locale,
      scope,
      emailDelivery,
      parentNotifyEmail,
      studentNotifyEmail,
      bothNotifyEmail,
      appOrigin: publicOriginFromRequest(req),
    });

    if (result.ok === false) {
      return res.status(result.status).json({ error: result.error, code: result.code });
    }

    return res.status(200).json({
      success: true,
      parent: result.parent ?? null,
      student: result.student ?? null,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[mv-provision-family-accounts]', e);
    return res.status(500).json({ error: message });
  }
}
