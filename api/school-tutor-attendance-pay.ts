import type { VercelRequest, VercelResponse } from './types.js';
import { verifyRequestAuth } from './_lib/auth.js';
import { serviceSupabase } from './_lib/extraLessonsContractShared.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import { loadSchoolTutorAttendancePayRows, schoolTutorAttendancePayPeriod,
  SchoolTutorAttendancePayPeriodError } from './_lib/schoolTutorAttendancePay.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const auth = await verifyRequestAuth(req);
    if (!auth?.userId) return res.status(401).json({ error: 'Unauthorized' });
    const tutorId = req.query?.tutorId || auth.userId;
    const periodStart = req.query?.periodStart, periodEnd = req.query?.periodEnd;
    if (typeof tutorId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tutorId)
      || typeof periodStart !== 'string' || typeof periodEnd !== 'string') {
      return res.status(400).json({ error: 'Invalid school teacher pay request' });
    }
    schoolTutorAttendancePayPeriod(periodStart, periodEnd);
    const db = serviceSupabase();
    const [profile, admin] = await Promise.all([
      db.from('profiles').select('id,organization_id').eq('id', tutorId).maybeSingle(),
      getOrgAdminAccessByUserId(db, auth.userId),
    ]);
    if (profile.error) throw profile.error;
    const organizationId = profile.data?.organization_id;
    if (!organizationId || (auth.userId !== tutorId && (!admin || admin.organizationId !== organizationId
      || (!hasOrgAdminPermission(admin.role, admin.permissions, 'finance.view')
        && !hasOrgAdminPermission(admin.role, admin.permissions, 'tutors.view'))))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const org = await db.from('organizations').select('entity_type').eq('id', organizationId).maybeSingle();
    if (org.error) throw org.error;
    if (org.data?.entity_type !== 'school') return res.status(403).json({ error: 'School required' });
    const rows = await loadSchoolTutorAttendancePayRows(db, { tutorId, organizationId, periodStart, periodEnd });
    return res.status(200).json({ ok: true, rows });
  } catch (error) {
    if (error instanceof SchoolTutorAttendancePayPeriodError) return res.status(400).json({ error: error.message });
    // A missing snapshot column/migration must never become an unlocked pay calculation.
    console.error('[school-tutor-attendance-pay] Load failed');
    return res.status(503).json({ error: 'School teacher attendance pay is unavailable' });
  }
}
