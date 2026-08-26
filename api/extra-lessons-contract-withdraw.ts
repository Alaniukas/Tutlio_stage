import type { VercelRequest, VercelResponse } from './types';
import { isWithinWithdrawalWindow } from '../src/lib/extraLessonsContract.js';
import { loadExtraLessonsContractByToken, serviceSupabase } from './_lib/extraLessonsContractShared.js';
import { verifyRequestAuth } from './_lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const supabase = serviceSupabase();
  const body = (req.body || {}) as Record<string, unknown>;
  const token = String(body.token || '').trim();
  const contractId = String(body.contract_id || '').trim();

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
      .select('*, student:students(id, linked_user_id, payer_email)')
      .eq('id', contractId)
      .maybeSingle();
    contract = data;
  } else {
    return res.status(400).json({ error: 'Missing token or contract_id' });
  }

  if (!contract?.accepted_at) return res.status(400).json({ error: 'Not accepted yet' });
  if (contract.withdrawal_requested_at) return res.status(409).json({ error: 'Already withdrawn' });
  if (!isWithinWithdrawalWindow(contract.accepted_at) && body.force !== true) {
    // After 14 days this is ordinary termination (PDF 7.2) — still allowed, flagged.
  }

  const { error } = await supabase.from('school_contracts').update({
    withdrawal_requested_at: new Date().toISOString(),
    withdrawal_reason: String(body.reason || 'parent_withdrawal').slice(0, 500),
  }).eq('id', contract.id);
  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({
    ok: true,
    within14Days: isWithinWithdrawalWindow(contract.accepted_at),
    startWithin14: contract.start_within_14_days === true,
  });
}
