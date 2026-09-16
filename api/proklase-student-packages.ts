import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { requireOrgAdminAccess } from './_lib/orgAdminAccess.js';
import { isProKlaseOrg } from './_lib/marketMoney.js';
import { orgStudentIdentityGroupKey } from '../src/lib/orgStudentIdentity.js';
import { proKlaseTrialFollowupStudentIds } from '../src/lib/proKlasePackageStatus.js';

function json(res: VercelResponse, status: number, body: unknown) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).send(JSON.stringify(body));
}

function getServiceClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const STUDENT_IDENTITY_SELECT =
  'id, tutor_id, linked_user_id, email, organization_id, full_name, payer_email';
const PACKAGE_SELECT = `
  id, student_id, tutor_id, subject_id, total_lessons, available_lessons,
  reserved_lessons, completed_lessons, total_price, price_per_lesson, paid,
  payment_status, active, created_at, expires_at, billing_period_start,
  billing_period_end, pool_organization_id, pool_email_sent_at,
  subject:subjects(name, color, is_trial),
  lesson_package_items(subject_id, total_lessons, available_lessons, total_price,
    price_per_lesson, position, subjects!inner(name, color, is_trial))
`;

async function loadOrganizationStudents(db: any, organizationId: string) {
  const tutorsRes = await db.from('profiles').select('id').eq('organization_id', organizationId);
  if (tutorsRes.error) throw new Error(tutorsRes.error.message);
  const tutorIds = (tutorsRes.data || []).map((row: any) => String(row.id));
  const [directRes, tutorRes] = await Promise.all([
    db.from('students').select(STUDENT_IDENTITY_SELECT)
      .eq('organization_id', organizationId).is('detached_at', null),
    tutorIds.length > 0
      ? db.from('students').select(STUDENT_IDENTITY_SELECT)
        .in('tutor_id', tutorIds).is('detached_at', null)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (directRes.error || tutorRes.error) throw new Error((directRes.error || tutorRes.error).message);
  const seen = new Set<string>();
  return [...(directRes.data || []), ...(tutorRes.data || [])].filter((row: any) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
  const db = getServiceClient();
  if (!db) return json(res, 500, { error: 'Server configuration error' });

  try {
    const auth = await requireOrgAdminAccess(req, db, 'students.view');
    if (auth.ok === false) return json(res, auth.status, { error: auth.error });
    const organizationId = auth.access.organizationId;
    if (!isProKlaseOrg(organizationId)) {
      return json(res, 403, { error: 'This package view is not enabled for this organization' });
    }

    const students = await loadOrganizationStudents(db, organizationId);
    const studentIds = students.map((row: any) => String(row.id));
    if (req.query.summary === 'trial-followup') {
      if (studentIds.length === 0) return json(res, 200, { studentIds: [] });
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const [trialRes, packageRes] = await Promise.all([
        db.from('sessions').select('student_id, subjects!inner(is_trial)')
          .in('student_id', studentIds).eq('status', 'completed')
          .eq('subjects.is_trial', true).gte('start_time', thirtyDaysAgo.toISOString()),
        db.from('lesson_packages').select(PACKAGE_SELECT).in('student_id', studentIds),
      ]);
      if (trialRes.error || packageRes.error) {
        throw new Error((trialRes.error || packageRes.error).message);
      }
      const result = proKlaseTrialFollowupStudentIds(
        students,
        (trialRes.data || []).map((row: any) => String(row.student_id)),
        packageRes.data || [],
      );
      return json(res, 200, { studentIds: [...result] });
    }

    const requestedId = typeof req.query.studentId === 'string' ? req.query.studentId : '';
    const requestedStudent = students.find((row: any) => row.id === requestedId);
    if (!requestedStudent) return json(res, 404, { error: 'Mokinys nerastas' });
    const identityKey = orgStudentIdentityGroupKey(requestedStudent);
    const identityStudentIds = students
      .filter((row: any) => orgStudentIdentityGroupKey(row) === identityKey)
      .map((row: any) => String(row.id));
    const packageRes = await db.from('lesson_packages').select(PACKAGE_SELECT)
      .in('student_id', identityStudentIds).order('created_at', { ascending: false });
    if (packageRes.error) throw new Error(packageRes.error.message);
    const organizationTutorIds = new Set(
      students.map((row: any) => row.tutor_id).filter(Boolean).map(String),
    );
    const packages = (packageRes.data || []).filter((pkg: any) => {
      const belongsToOrg = pkg.pool_organization_id === organizationId
        || organizationTutorIds.has(String(pkg.tutor_id || ''));
      const visibleState = pkg.active !== false || pkg.payment_status === 'pending';
      return belongsToOrg && visibleState && pkg.payment_status !== 'cancelled';
    });
    return json(res, 200, { packages });
  } catch (error: any) {
    console.error('[proklase-student-packages] error:', error);
    return json(res, 500, { error: 'Internal Server Error', details: error?.message || String(error) });
  }
}
