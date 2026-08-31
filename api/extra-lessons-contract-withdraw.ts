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
    const { data: student } = await supabase
      .from('students')
      .select('id, full_name, payer_name, payer_email, payer_phone, linked_user_id, parent_user_id')
      .eq('id', data.student_id)
      .maybeSingle();
    const allowed = parentMayEndExtraLessonsContract({
      authUserId: auth.userId,
      acceptedByUserId: data.accepted_by_user_id,
      studentLinkedUserId: student?.linked_user_id,
      studentParentUserId: student?.parent_user_id,
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

  const result = await endExtraLessonsContract({
    supabase,
    contract,
    intendedKind,
    origin: internalApiOrigin(req),
  });
  if ('status' in result) return res.status(result.status).json({ error: result.error });
  return res.status(200).json({
    ok: true,
    kind: result.kind,
    within14Days: isWithinWithdrawalWindow(contract.accepted_at),
    startWithin14: contract.start_within_14_days === true,
    extraEndKind: extraLessonsEndKind(contract.accepted_at),
    statementPath: result.statementPath,
  });
}
