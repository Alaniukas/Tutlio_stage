import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import { resolveOrgStudentEmailConflict } from './_lib/orgStudentContactConflict.js';

function json(res: VercelResponse, status: number, body: Record<string, unknown>) {
  return res.status(status).json(body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  try {
    const auth = await verifyRequestAuth(req);
    if (!auth?.userId || auth.isInternal) return json(res, 401, { error: 'Unauthorized' });

    const organizationId = String(req.body?.organizationId || '').trim();
    const fullName = String(req.body?.fullName || '').trim();
    const studentEmail = String(req.body?.studentEmail || '').trim();
    const excludeStudentIds = Array.isArray(req.body?.excludeStudentIds)
      ? req.body.excludeStudentIds.filter((value: unknown): value is string => typeof value === 'string')
      : [];

    if (!organizationId) return json(res, 400, { error: 'organizationId is required' });
    if (!studentEmail.includes('@')) return json(res, 200, { ok: true });

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) return json(res, 500, { error: 'Missing Supabase env vars' });

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const admin = await getOrgAdminAccessByUserId(supabase, auth.userId);
    if (!admin || admin.organizationId !== organizationId
      || !hasOrgAdminPermission(admin.role, admin.permissions, 'students.edit')) {
      return json(res, 403, { error: 'Insufficient organization permission' });
    }

    const conflict = await resolveOrgStudentEmailConflict(supabase, {
      organizationId,
      fullName,
      studentEmail,
      excludeStudentIds,
    });
    if (!conflict) return json(res, 200, { ok: true });

    return json(res, 409, {
      ok: false,
      code: conflict.code,
      email: conflict.email,
      existingStudentId: conflict.existingStudentId,
      existingStudentName: conflict.existingStudentName,
    });
  } catch (error) {
    console.error('[org-student-contact-check]', error);
    return json(res, 503, { error: 'Contact check unavailable' });
  }
}
