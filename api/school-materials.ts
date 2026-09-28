import type { VercelRequest, VercelResponse } from './types';
import { verifyRequestAuth } from './_lib/auth.js';
import { serviceSupabase } from './_lib/extraLessonsContractShared.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import { prepareSchoolMaterialBaseline } from './_lib/schoolMaterialPublications.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await verifyRequestAuth(req);
  if (!auth?.userId) return res.status(401).json({ error: 'Unauthorized' });
  const db = serviceSupabase();
  try {
    const admin = await getOrgAdminAccessByUserId(db, auth.userId);
    if (!admin || !hasOrgAdminPermission(admin.role, admin.permissions, 'sessions.edit')) return res.status(403).json({ error: 'Forbidden' });
    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      if (body?.action !== 'baseline') return res.status(400).json({ error: 'Invalid action' });
      return res.status(200).json({ ok: true, ...await prepareSchoolMaterialBaseline(db, admin.organizationId) });
    }
    const { data, error } = await db.from('school_material_baselines').select('completed_at,drive_offset')
      .eq('organization_id', admin.organizationId).maybeSingle();
    if (error) throw error;
    return res.status(200).json({ ok: true, complete: Boolean(data?.completed_at), folders: data?.drive_offset || 0 });
  } catch (e) {
    console.error('[school-materials] preparation failed', (e as Error).message);
    return res.status(503).json({ error: (e as Error).message === 'school_material_baseline_requires_disabled_portal'
      ? 'school_material_baseline_requires_disabled_portal' : 'school_material_baseline_failed' });
  }
}
