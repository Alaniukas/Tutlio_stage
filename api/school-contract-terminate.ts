import type { VercelRequest, VercelResponse } from './types';
import { requireOrgAdminAccess } from './_lib/orgAdminAccess.js';
import { serviceSupabase } from './_lib/extraLessonsContractShared.js';
import {
  previewSchoolGroupContractExit,
  suspendSchoolGroupIfBelowMinimum,
} from './_lib/schoolGroupMinimumPolicy.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = serviceSupabase();
  const admin = await requireOrgAdminAccess(req, supabase, 'contracts.edit');
  if (admin.ok === false) return res.status(admin.status).json({ error: admin.error });

  const contractId = String(req.body?.contractId || '').trim();
  const reason = String(req.body?.reason || '').trim();
  if (!contractId) return res.status(400).json({ error: 'Missing contractId' });

  const { data: contract, error: loadError } = await supabase
    .from('school_contracts')
    .select('id, organization_id, kind, class_group_id, terminated_at, withdrawal_requested_at')
    .eq('id', contractId)
    .eq('organization_id', admin.access.organizationId)
    .maybeSingle();
  if (loadError) return res.status(500).json({ error: loadError.message });
  if (!contract) return res.status(404).json({ error: 'Contract not found' });
  if (contract.terminated_at || contract.withdrawal_requested_at) {
    return res.status(200).json({ success: true, alreadyTerminated: true });
  }

  const groupImpact = contract.class_group_id
    ? await previewSchoolGroupContractExit(
        supabase,
        admin.access.organizationId,
        contract.class_group_id,
        contract.id,
      )
    : null;
  if (req.body?.preview === true) {
    return res.status(200).json({
      success: true,
      willSuspendGroup: groupImpact?.willSuspendGroup === true,
      groupImpact,
    });
  }
  if (reason.length < 3) return res.status(400).json({ error: 'Termination reason is required' });
  if (reason.length > 1000) return res.status(400).json({ error: 'Termination reason is too long' });
  if (groupImpact?.willSuspendGroup && req.body?.confirmGroupSuspension !== true) {
    return res.status(409).json({
      error: `Nutraukus šią sutartį aktyvių mokinių skaičius grupėje „${groupImpact.groupName}“ sumažės iki ${groupImpact.remainingActiveStudentCount}, todėl visa grupė bus sustabdyta.`,
      code: 'GROUP_WILL_SUSPEND',
      groupImpact,
    });
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

  const groupResult = contract.class_group_id
    ? await suspendSchoolGroupIfBelowMinimum(req, supabase, {
        organizationId: admin.access.organizationId,
        groupId: contract.class_group_id,
        triggerContractId: contract.id,
        adminUserId: admin.access.userId,
      })
    : null;
  return res.status(200).json({ success: true, terminatedAt: nowIso, ...(groupResult || {}) });
}
