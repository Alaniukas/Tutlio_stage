import type { VercelRequest, VercelResponse } from './types.js';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { getOrgAdminSeatByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import { studentRegistrationEnabled } from '../src/lib/studentRegistration.js';
import { loadStudentRegistrationStates } from './_lib/studentRegistration.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await verifyRequestAuth(req);
  if (!auth?.userId || auth.isInternal) return res.status(401).json({ error: 'Unauthorized' });
  let enabled = false;
  try {
    const db = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const admin = await getOrgAdminSeatByUserId(db, auth.userId);
    let organizationId: string;
    let tutorId: string | null = null;
    if (admin) {
      if (admin.status !== 'active' || !hasOrgAdminPermission(admin.role, admin.permissions, 'students.view')) {
        return res.status(403).json({ error: 'Insufficient organization permission' });
      }
      organizationId = admin.organizationId;
    } else {
      const { data: profile, error } = await db.from('profiles').select('organization_id').eq('id', auth.userId).maybeSingle();
      if (error) throw error;
      if (!profile?.organization_id) return res.status(403).json({ error: 'Forbidden' });
      organizationId = profile.organization_id;
      tutorId = auth.userId;
    }
    const { data: org, error } = await db.from('organizations').select('features').eq('id', organizationId).maybeSingle();
    if (error) throw error;
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    enabled = studentRegistrationEnabled(organizationId, org.features);
    if (!enabled) return res.status(200).json({ enabled: false, states: [] });
    const states = await loadStudentRegistrationStates(db, organizationId, tutorId);
    return res.status(200).json({ enabled: true, states });
  } catch (error) {
    console.error('[student-registration-status]', error);
    return res.status(503).json({ enabled, error: 'Registration status unavailable' });
  }
}
