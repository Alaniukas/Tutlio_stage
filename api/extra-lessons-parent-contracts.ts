import type { VercelRequest, VercelResponse } from './types';
import { isParentVisibleSchoolContract, mapParentSchoolContract, uniqueStudentIds } from '../src/lib/extraLessonsParentPortal.js';
import { verifyRequestAuth } from './_lib/auth.js';
import { serviceSupabase } from './_lib/extraLessonsContractShared.js';
import { extractSchoolContractStoragePath, SCHOOL_CONTRACTS_BUCKET } from './_lib/schoolContractPdfPath.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const auth = await verifyRequestAuth(req);
  if (!auth?.userId) return res.status(401).json({ error: 'Unauthorized' });
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
  const studentCols = 'id, full_name, linked_user_id';
  const [{ data: byAuth }, { data: byParentUser }, byIdsRes] = await Promise.all([
    supabase.from('students').select(studentCols).eq('linked_user_id', auth.userId),
    supabase.from('students').select(studentCols).eq('parent_user_id', auth.userId),
    linkIds.length
      ? supabase.from('students').select(studentCols).in('id', linkIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; linked_user_id: string | null }[] }),
  ]);
  const linked = [...(byAuth || []), ...(byParentUser || []), ...((byIdsRes as any).data || [])];
  const studentIds = uniqueStudentIds(linked);
  if (!studentIds.length) return res.status(200).json({ ok: true, contracts: [] });

  const selectCols =
    'id, contract_number, revision_label, accepted_at, signing_status, signed_contract_url, pdf_url, extra_end_statement_path, withdrawal_requested_at, extra_end_kind, start_within_14_status, student_id, kind, party_kind, created_at';
  let { data: rows, error } = await supabase
    .from('school_contracts')
    .select(selectCols)
    .is('archived_at', null)
    .in('student_id', studentIds)
    .order('created_at', { ascending: false });
  if (error && /party_kind/i.test(error.message)) {
    ({ data: rows, error } = await supabase
      .from('school_contracts')
      .select(selectCols.replace(', party_kind', ''))
      .is('archived_at', null)
      .in('student_id', studentIds)
      .order('created_at', { ascending: false }));
  }
  if (error) return res.status(500).json({ error: error.message });
  const visible = (rows || []).filter(isParentVisibleSchoolContract);

  const file = String(req.query?.file || '').trim();
  const contractId = String(req.query?.contract_id || '').trim();
  if (file && contractId) {
    const row = visible.find((r) => r.id === contractId);
    if (!row) return res.status(404).json({ error: 'not_found' });
    const raw = file === 'statement' ? row.extra_end_statement_path : (row.signed_contract_url || row.pdf_url);
    const path = raw ? extractSchoolContractStoragePath(String(raw)) : '';
    if (!path) return res.status(404).json({ error: 'no_file' });
    const { data: signed } = await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET).createSignedUrl(path, 60);
    return res.status(200).json({ ok: true, url: signed?.signedUrl || null });
  }

  const nameById = new Map((linked || []).map((s) => [s.id, s.full_name]));
  return res.status(200).json({
    ok: true,
    contracts: visible.map((row) => mapParentSchoolContract(row, nameById.get(row.student_id) || '')),
  });
}
