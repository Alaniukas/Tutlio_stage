import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from './types';
import { requireOrgAdminAccess } from './_lib/orgAdminAccess.js';
import { schoolFamilyAccountsSetupEnabled } from './_lib/schoolFamilyGuardianAccess.js';
import { publicOriginFromRequest } from './_lib/public-origin.js';
import {
  SCHOOL_FAMILY_BATCH_SIZE, schoolFamilyAccountsPreview, runSchoolFamilyAccountWorkflow,
  verifySchoolFamilyGuardian, type SchoolFamilyOrganization,
  splitSchoolFamilySharedIdentity,
} from './_lib/schoolFamilyAccounts.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return res.status(500).json({ error: 'server_not_configured' });
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const access = await requireOrgAdminAccess(req, db, req.method === 'POST' ? 'students.edit' : 'students.view');
  if (access.ok === false) return res.status(access.status).json({ error: access.error });
  const organization = await db.from('organizations').select('id,name,slug,entity_type,preferred_locale,features,logo_url,brand_color,brand_color_secondary')
    .eq('id', access.access.organizationId).maybeSingle();
  const org = organization.data as SchoolFamilyOrganization | null;
  if (organization.error || !org) return res.status(404).json({ error: 'organization_not_found' });
  if (org.entity_type !== 'school' || !schoolFamilyAccountsSetupEnabled(org.features)) return res.status(403).json({ error: 'org_not_supported' });
  try {
    if (req.method === 'GET') {
      const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : '';
      if (cursor && !UUID.test(cursor)) return res.status(400).json({ error: 'invalid_cursor' });
      return res.status(200).json(await schoolFamilyAccountsPreview(db, org, cursor));
    }
    let body: Record<string, unknown> = req.body || {};
    if (typeof req.body === 'string') { try { body = JSON.parse(req.body); } catch { return res.status(400).json({ error: 'invalid_body' }); } }
    const action = body.action;
    if (action === 'split_shared') {
      if (!UUID.test(String(body.studentId || ''))) return res.status(400).json({ error: 'invalid_student' });
      return res.status(200).json(await splitSchoolFamilySharedIdentity(db, org, access.access.userId,
        String(body.studentId), body.confirmed === true, publicOriginFromRequest(req)));
    }
    if (action === 'verify_guardian') {
      if (!UUID.test(String(body.studentId || '')) || !UUID.test(String(body.contractId || ''))) return res.status(400).json({ error: 'invalid_student' });
      await verifySchoolFamilyGuardian(db, org.id, access.access.userId, {
        studentId: String(body.studentId), contractId: String(body.contractId), guardianName: String(body.guardianName || ''),
        guardianEmail: String(body.guardianEmail || ''), personalCode: String(body.personalCode || ''), confirmed: body.confirmed === true,
      });
      return res.status(200).json({ success: true });
    }
    if (action !== 'provision' && action !== 'resend') return res.status(400).json({ error: 'invalid_action' });
    const studentIds = Array.isArray(body.studentIds) ? [...new Set(body.studentIds.filter((id): id is string => typeof id === 'string'))] : [];
    if (!studentIds.length || studentIds.length > SCHOOL_FAMILY_BATCH_SIZE || studentIds.some((id) => !UUID.test(id))) return res.status(400).json({ error: 'invalid_batch' });
    const results = [];
    const invitedAccounts = new Set<string>();
    for (const studentId of studentIds) {
      try { results.push(await runSchoolFamilyAccountWorkflow(db, org, access.access.userId, studentId, action, publicOriginFromRequest(req), invitedAccounts)); }
      catch (error) { results.push({ studentId, success: false, code: (error as Error).message }); }
    }
    return res.status(200).json({ success: true, results });
  } catch (error) {
    const code = (error as Error).message;
    return res.status(code === 'school_family_setup_required' ? 503 : 400).json({ error: code });
  }
}
