import type { VercelRequest, VercelResponse } from './types';
import { extraLessonsEndKind, isWithinWithdrawalWindow } from '../src/lib/extraLessonsContract.js';
import { parentMayEndExtraLessonsContract } from '../src/lib/extraLessonsParentPortal.js';
import {
  endExtraLessonsContract,
  internalApiOrigin,
  loadExtraLessonsContractByToken,
  serviceSupabase,
} from './_lib/extraLessonsContractShared.js';
import { verifyRequestAuth } from './_lib/auth.js';
import { suspendSchoolGroupIfBelowMinimum } from './_lib/schoolGroupMinimumPolicy.js';
import { isExtraLessonsContractKind } from '../src/lib/extraLessonsContract.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const supabase = serviceSupabase();
  const body = (req.body || {}) as Record<string, unknown>;
  const token = String(body.token || '').trim();
  const contractId = String(body.contract_id || '').trim();
  const intendedKind = body.intended_kind === 'termination' || body.intended_kind === 'withdrawal'
    ? body.intended_kind
    : null;

  let contract: any = null;
  let actorUserId: string | null = null;
  if (token) {
    const loaded = await loadExtraLessonsContractByToken(supabase, token);
    if ('error' in loaded && loaded.error) {
      return res.status(404).json({ error: loaded.error });
    }
    contract = (loaded as any).contract;
  } else if (contractId) {
    const auth = await verifyRequestAuth(req);
    if (!auth?.userId) return res.status(401).json({ error: 'Unauthorized' });
    const { data } = await supabase
      .from('school_contracts')
      .select('*')
      .eq('id', contractId)
      .maybeSingle();
    if (!data) return res.status(404).json({ error: 'not_found' });
    if (!isExtraLessonsContractKind(data.kind)) return res.status(400).json({ error: 'Only extra-lessons contracts can be ended here' });
    actorUserId = auth.userId;
    const { data: student } = await supabase
      .from('students')
      .select('id, full_name, payer_name, payer_email, payer_phone, linked_user_id, parent_user_id')
      .eq('id', data.student_id)
      .maybeSingle();
    let linkedParent = false;
    const { data: parentProfile } = await supabase.from('parent_profiles').select('id')
      .eq('user_id', auth.userId).maybeSingle();
    if (parentProfile?.id) {
      const { data: parentLink } = await supabase.from('parent_students').select('student_id')
        .eq('parent_id', parentProfile.id).eq('student_id', data.student_id).maybeSingle();
      linkedParent = Boolean(parentLink);
    }
    const allowed = parentMayEndExtraLessonsContract({
      authUserId: auth.userId,
      acceptedByUserId: data.accepted_by_user_id,
      studentLinkedUserId: student?.linked_user_id,
      studentParentUserId: student?.parent_user_id,
      linkedParent,
    });
    if (!allowed) return res.status(403).json({ error: 'Forbidden' });
    const { data: organization } = await supabase
      .from('organizations')
      .select('id, name, email, phone')
      .eq('id', data.organization_id)
      .maybeSingle();
    contract = { ...data, student, organizations: organization };
  } else {
    return res.status(400).json({ error: 'Missing token or contract_id' });
  }

  // Complete roster reconciliation on a retry after the end timestamp was
  // already saved, without sending the family's confirmation twice.
  const result = contract.withdrawal_requested_at
    ? { ok: true as const, kind: contract.extra_end_kind, statementPath: contract.extra_end_statement_path || null }
    : await endExtraLessonsContract({
    supabase,
    contract,
    intendedKind,
    origin: internalApiOrigin(req),
    actorUserId,
  });
  if ('status' in result) return res.status(result.status).json({ error: result.error });
  const groupResult = contract.class_group_id
    ? await suspendSchoolGroupIfBelowMinimum(req, supabase, {
        organizationId: contract.organization_id, groupId: contract.class_group_id,
        triggerContractId: contract.id, adminUserId: actorUserId,
      })
    : null;
  return res.status(200).json({
    ok: true,
    kind: result.kind,
    within14Days: isWithinWithdrawalWindow(contract.accepted_at),
    startWithin14: contract.start_within_14_days === true,
    extraEndKind: extraLessonsEndKind(contract.accepted_at),
    statementPath: result.statementPath,
    ...(groupResult || {}),
  });
}
