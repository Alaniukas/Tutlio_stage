import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import { publicOriginFromRequest } from './_lib/public-origin.js';
import { sendPendingPackagePaymentEmail } from './_lib/sendPendingPackageEmail.js';

function json(res: VercelResponse, status: number, body: unknown) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).send(JSON.stringify(body));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return json(res, 401, { error: 'Unauthorized' });

  const { packageId } = (req.body || {}) as { packageId?: string };
  if (!packageId) return json(res, 400, { error: 'Missing packageId' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !serviceRoleKey) {
    return json(res, 500, { error: 'Server configuration error' });
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const token = authHeader.replace('Bearer ', '');
    const { data: authData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !authData?.user) return json(res, 401, { error: 'Unauthorized' });

    const adminAccess = await getOrgAdminAccessByUserId(supabase, authData.user.id);
    if (!adminAccess || !hasOrgAdminPermission(adminAccess.role, adminAccess.permissions, 'finance.edit')) {
      return json(res, 403, { error: 'Only an administrator with finance edit access can resend package emails' });
    }

    const appOrigin = publicOriginFromRequest(req);
    const requestOrigin = req.headers.origin ? String(req.headers.origin) : null;
    const sendEmailUrl = `${(requestOrigin || appOrigin).replace(/\/$/, '')}/api/send-email`;
    const emailed = await sendPendingPackagePaymentEmail({
      supabase,
      packageId,
      organizationId: adminAccess.organizationId,
      appOrigin,
      sendEmailUrl,
      serviceRoleKey,
    });
    if (emailed.ok === false) {
      return json(res, emailed.status, { error: emailed.error, details: emailed.details });
    }
    return json(res, 200, { success: true });
  } catch (err: any) {
    console.error('[resend-package-email] error:', err);
    return json(res, 500, { error: 'Internal Server Error', details: err?.message || String(err) });
  }
}
