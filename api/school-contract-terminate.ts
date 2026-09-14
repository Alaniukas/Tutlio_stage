import type { VercelRequest, VercelResponse } from './types';
import { requireOrgAdminAccess } from './_lib/orgAdminAccess.js';
import { serviceSupabase } from './_lib/extraLessonsContractShared.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = serviceSupabase();
  const admin = await requireOrgAdminAccess(req, supabase, 'contracts.edit');
  if (admin.ok === false) return res.status(admin.status).json({ error: admin.error });

  const contractId = String(req.body?.contractId || '').trim();
  const reason = String(req.body?.reason || '').trim();
  if (!contractId) return res.status(400).json({ error: 'Missing contractId' });
  if (reason.length < 3) return res.status(400).json({ error: 'Termination reason is required' });
  if (reason.length > 1000) return res.status(400).json({ error: 'Termination reason is too long' });

  const { data: contract, error: loadError } = await supabase
    .from('school_contracts')
    .select('id, organization_id, kind, terminated_at, withdrawal_requested_at')
    .eq('id', contractId)
    .eq('organization_id', admin.access.organizationId)
    .maybeSingle();
  if (loadError) return res.status(500).json({ error: loadError.message });
  if (!contract) return res.status(404).json({ error: 'Contract not found' });
  if (contract.terminated_at || contract.withdrawal_requested_at) {
    return res.status(200).json({ success: true, alreadyTerminated: true });
  }

  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    terminated_at: nowIso,
    termination_reason: reason,
    terminated_by: admin.access.userId,
  };
  // Existing extra-lessons billing and materialization use this legacy end
  // timestamp; keep it in sync while the general audit fields cover both kinds.
  if (contract.kind === 'extra_lessons') {
    patch.withdrawal_requested_at = nowIso;
    patch.withdrawal_reason = 'school_admin_termination';
    patch.extra_end_kind = 'termination';
  }

  const { data: updated, error: updateError } = await supabase
    .from('school_contracts')
    .update(patch)
    .eq('id', contract.id)
    .is('terminated_at', null)
    .select('id, terminated_at')
    .maybeSingle();
  if (updateError) return res.status(500).json({ error: updateError.message });
  if (!updated) return res.status(409).json({ error: 'Contract changed; reload and try again' });

  return res.status(200).json({ success: true, terminatedAt: nowIso });
}
