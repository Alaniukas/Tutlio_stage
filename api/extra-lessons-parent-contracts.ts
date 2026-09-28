import type { VercelRequest, VercelResponse } from './types';
import { isParentVisibleSchoolContract, mapParentSchoolContract, uniqueStudentIds } from '../src/lib/extraLessonsParentPortal.js';
import { verifyRequestAuth } from './_lib/auth.js';
import { serviceSupabase } from './_lib/extraLessonsContractShared.js';
import { extractSchoolContractStoragePath, SCHOOL_CONTRACTS_BUCKET } from './_lib/schoolContractPdfPath.js';
import { loadSchoolFamilyGuardianAccess, schoolFamilyPortalEnabled } from './_lib/schoolFamilyGuardianAccess.js';
import type { SupabaseClient } from '@supabase/supabase-js';

type ParentContractStudent = {
  id: string;
  full_name: string | null;
  linked_user_id: string | null;
  organization_id: string | null;
};

/** Legacy links remain candidates, but never grant parent contract access in an opted-in school. */
async function allowedParentContractStudents(db: SupabaseClient, userId: string, candidates: ParentContractStudent[]) {
  const orgIds = [...new Set(candidates.map((student) => student.organization_id).filter((id): id is string => !!id))];
  if (!orgIds.length) return candidates;
  const organizations = await db.from('organizations').select('id,entity_type,features').in('id', orgIds);
  if (organizations.error || (organizations.data || []).length !== orgIds.length) throw new Error('school_family_access_unavailable');
  const enabled = (organizations.data || []).filter((org) => org.entity_type === 'school' && schoolFamilyPortalEnabled(org.features));
  const grants = new Map<string, Set<string>>();
  await Promise.all(enabled.map(async (org) => {
    const access = await loadSchoolFamilyGuardianAccess(db, userId, org.id);
    grants.set(org.id, new Set(access.distinctParent ? access.studentIds : []));
  }));
  return candidates.filter((student) => !student.organization_id || !grants.has(student.organization_id)
    || grants.get(student.organization_id)!.has(student.id));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await verifyRequestAuth(req);
  if (!auth?.userId) return res.status(401).json({ error: 'Unauthorized' });
  res.setHeader('Cache-Control', 'private, no-store');
  const supabase = serviceSupabase();

  const { data: parentProfile } = await supabase
    .from('parent_profiles')
    .select('id')
    .eq('user_id', auth.userId)
    .maybeSingle();
  const { data: parentLinks } = parentProfile?.id
    ? await supabase.from('parent_students').select('student_id').eq('parent_id', parentProfile.id)
    : { data: [] as { student_id: string }[] };
  const linkIds = (parentLinks || []).map((l) => l.student_id).filter(Boolean);
  const studentCols = 'id, full_name, linked_user_id, organization_id';
  const [byAuthRes, byParentUserRes, byIdsRes] = await Promise.all([
    supabase.from('students').select(studentCols).eq('linked_user_id', auth.userId),
    supabase.from('students').select(studentCols).eq('parent_user_id', auth.userId),
    linkIds.length
      ? supabase.from('students').select(studentCols).in('id', linkIds)
      : Promise.resolve({ data: [] as ParentContractStudent[], error: null }),
  ]);
  if (byAuthRes.error || byParentUserRes.error || byIdsRes.error) {
    return res.status(503).json({ error: 'school_family_access_unavailable' });
  }
  const candidates = [...(byAuthRes.data || []), ...(byParentUserRes.data || []), ...(byIdsRes.data || [])] as ParentContractStudent[];
  let linked: ParentContractStudent[];
  try {
    linked = await allowedParentContractStudents(supabase, auth.userId, candidates);
  } catch {
    return res.status(503).json({ error: 'school_family_access_unavailable' });
  }
  const studentIds = uniqueStudentIds(linked);
  if (!studentIds.length) {
    if (req.query?.file && req.query?.contract_id) return res.status(404).json({ error: 'not_found' });
    return res.status(200).json({ ok: true, contracts: [] });
  }

  const selectCols =
    'id, contract_number, revision_label, accepted_at, signing_status, signed_contract_url, pdf_url, extra_end_statement_path, withdrawal_requested_at, extra_end_kind, start_within_14_status, student_id, kind, party_kind, created_at';
  let { data: rows, error } = await supabase
    .from('school_contracts')
    .select(selectCols)
    .is('archived_at', null)
    .in('student_id', studentIds)
    .order('created_at', { ascending: false });
  if (error && /party_kind/i.test(error.message)) {
    const fallback = await supabase
      .from('school_contracts')
      .select(selectCols.replace(', party_kind', ''))
      .is('archived_at', null)
      .in('student_id', studentIds)
      .order('created_at', { ascending: false });
    rows = fallback.data as any;
    error = fallback.error;
  }
  if (error) return res.status(500).json({ error: error.message });
  // Recheck after the query so a revoked annual binding or newly enabled portal cannot disclose a stale grant.
  try {
    linked = await allowedParentContractStudents(supabase, auth.userId, linked);
  } catch {
    return res.status(503).json({ error: 'school_family_access_unavailable' });
  }
  const currentStudentIds = new Set(linked.map((student) => student.id));
  const visible = (rows || []).filter((row) => currentStudentIds.has(row.student_id) && isParentVisibleSchoolContract(row));

  const file = String(req.query?.file || '').trim();
  const contractId = String(req.query?.contract_id || '').trim();
  if (file && contractId) {
    const row = visible.find((r) => r.id === contractId);
    if (!row) return res.status(404).json({ error: 'not_found' });
    const raw = file === 'statement' ? row.extra_end_statement_path : (row.signed_contract_url || row.pdf_url);
    const path = raw ? extractSchoolContractStoragePath(String(raw)) : '';
    if (!path) return res.status(404).json({ error: 'no_file' });
    const { data: signed } = await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET).createSignedUrl(path, 60);
    try {
      const current = await allowedParentContractStudents(supabase, auth.userId, linked.filter((student) => student.id === row.student_id));
      if (!current.length) return res.status(404).json({ error: 'not_found' });
    } catch {
      return res.status(503).json({ error: 'school_family_access_unavailable' });
    }
    return res.status(200).json({ ok: true, url: signed?.signedUrl || null });
  }

  const nameById = new Map((linked || []).map((s) => [s.id, s.full_name]));
  return res.status(200).json({
    ok: true,
    contracts: visible.map((row) => mapParentSchoolContract(row, nameById.get(row.student_id) || '')),
  });
}
