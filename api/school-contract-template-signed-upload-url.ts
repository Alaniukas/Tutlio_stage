import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';

function json(res: VercelResponse, status: number, body: unknown) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

/**
 * Org-scoped admins get a Storage signed-upload token for PDF/DOCX template files.
 * Avoids buggy client uploads when RLS/policy evaluation triggers Storage PG 42P17.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceRoleKey) return json(res, 500, { error: 'Server misconfigured' });

  const authHeader = typeof req.headers.authorization === 'string' ? req.headers.authorization : '';
  if (!authHeader.startsWith('Bearer ')) return json(res, 401, { error: 'Unauthorized' });

  const reqBody =
    req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? (req.body as Record<string, unknown>) : {};
  const organizationId = typeof reqBody.organizationId === 'string' ? reqBody.organizationId.trim() : '';
  const extRaw = typeof reqBody.extension === 'string' ? reqBody.extension.trim().toLowerCase() : '';
  const extension = extRaw.startsWith('.') ? extRaw.slice(1) : extRaw;

  if (!organizationId || !extension) {
    return json(res, 400, { error: 'organizationId and extension are required' });
  }
  if (extension !== 'pdf' && extension !== 'docx') {
    return json(res, 400, { error: 'Only pdf or docx templates are allowed' });
  }

  const adminSb = createClient(supabaseUrl, serviceRoleKey);
  const userSb = createClient(supabaseUrl, (anonKey || serviceRoleKey).trim());
  const jwt = authHeader.slice(7);
  const { data: authData, error: userErr } = await userSb.auth.getUser(jwt);
  if (userErr || !authData.user) return json(res, 401, { error: 'Invalid token' });

  const { data: adminRow } = await adminSb
    .from('organization_admins')
    .select('organization_id')
    .eq('user_id', authData.user.id)
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (!adminRow?.organization_id) {
    return json(res, 403, { error: 'Not authorized for this organization' });
  }

  const objectPath = `${organizationId}/${Date.now()}-${randomBytes(8).toString('hex')}.${extension}`;
  const { data: signData, error: signErr } = await adminSb.storage
    .from('school-contracts')
    .createSignedUploadUrl(objectPath, { upsert: false });

  if (signErr || !signData?.token || !signData.path) {
    console.error('[school-contract-template-signed-upload-url]', signErr);
    return json(res, 503, {
      error: signErr?.message || 'Could not prepare template upload — check Storage logs / bucket school-contracts',
    });
  }

  return json(res, 200, {
    path: signData.path,
    token: signData.token,
    signedUrl: signData.signedUrl,
  });
}
