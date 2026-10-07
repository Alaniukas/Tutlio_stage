import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import {
  extractSchoolContractStoragePath,
  SCHOOL_CONTRACTS_BUCKET,
} from './_lib/schoolContractPdfPath.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import { ensureExtraLessonsPdfPath } from './_lib/ensureSchoolContractPdfPath.js';

function json(res: VercelResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

/** Org-admin signed download URL for a school-contracts storage object. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const auth = await verifyRequestAuth(req);
  if (!auth || auth.isInternal || !auth.userId) return json(res, 401, { error: 'Unauthorized' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return json(res, 500, { error: 'Server misconfigured' });
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const rawPath = typeof req.body?.path === 'string' ? req.body.path.trim() : '';
  const contractId = typeof req.body?.contractId === 'string' ? req.body.contractId.trim() : '';
  if (!rawPath && !contractId) return json(res, 400, { error: 'Missing path' });

  const adminAccess = await getOrgAdminAccessByUserId(supabase, auth.userId);
  if (!hasOrgAdminPermission(adminAccess?.role, adminAccess?.permissions, 'contracts.view')) {
    return json(res, 403, { error: 'Forbidden' });
  }

  let path = rawPath ? extractSchoolContractStoragePath(rawPath) : '';
  let orgPrefix = path.split('/')[0] || '';

  if (!path && contractId) {
    if (adminAccess?.organizationId) {
      const ensured = await ensureExtraLessonsPdfPath(supabase, contractId, adminAccess.organizationId);
      if (ensured) path = ensured;
      orgPrefix = adminAccess.organizationId;
    }
    if (!path) return json(res, 404, { error: 'Sutarties failas dar neįkeltas.', code: 'file_not_found' });
  }

  if (!orgPrefix) return json(res, 400, { error: 'Invalid path' });
  if (adminAccess?.organizationId !== orgPrefix) return json(res, 403, { error: 'Forbidden' });

  const folderPath = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const fileName = path.includes('/') ? path.slice(path.lastIndexOf('/') + 1) : path;
  const { data: listed, error: listErr } = await supabase.storage
    .from(SCHOOL_CONTRACTS_BUCKET)
    .list(folderPath, { search: fileName, limit: 5 });
  if (listErr) return json(res, 500, { error: listErr.message });

  let exists = (listed || []).some((f) => f.name === fileName);
  if (!exists && contractId) {
    const ensured = await ensureExtraLessonsPdfPath(supabase, contractId, orgPrefix);
    if (ensured) {
      path = ensured;
      exists = true;
    }
  }
  if (!exists) {
    return json(res, 404, { error: 'Sutarties failas dar neįkeltas.', code: 'file_not_found' });
  }

  const { data: signed, error: signErr } = await supabase.storage
    .from(SCHOOL_CONTRACTS_BUCKET)
    .createSignedUrl(path, 60 * 15, req.body?.download === true ? { download: fileName } : undefined);
  if (signErr || !signed?.signedUrl) {
    return json(res, 500, { error: signErr?.message || 'Nepavyko sugeneruoti nuorodos.' });
  }

  return json(res, 200, { success: true, signedUrl: signed.signedUrl });
}
