import type { VercelRequest, VercelResponse } from './types';
import { requireOrgAdminAccess } from './_lib/orgAdminAccess.js';
import { serviceSupabase } from './_lib/extraLessonsContractShared.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabase = serviceSupabase();
  const admin = await requireOrgAdminAccess(req, supabase, 'contracts.edit');
  if (admin.ok === false) return res.status(admin.status).json({ error: admin.error });

  const contractId = String(req.body?.contractId || '').trim();
  const action = String(req.body?.action || 'suspend').trim();
  if (!contractId) return res.status(400).json({ error: 'Missing contractId' });
  if (action !== 'suspend' && action !== 'resume') return res.status(400).json({ error: 'Invalid action' });

  const { data: contract, error: loadError } = await supabase
    .from('school_contracts')
    .select('id, terminated_at, withdrawal_requested_at, suspension_started_at, suspension_resumed_at')
    .eq('id', contractId)
    .eq('organization_id', admin.access.organizationId)
    .maybeSingle();
  if (loadError) return res.status(500).json({ error: loadError.message });
  if (!contract) return res.status(404).json({ error: 'Contract not found' });
  if (contract.terminated_at || contract.withdrawal_requested_at) {
    return res.status(409).json({ error: 'Nutrauktos sutarties sustabdyti negalima.' });
  }

  const nowIso = new Date().toISOString();
  if (action === 'resume') {
    if (!contract.suspension_started_at || contract.suspension_resumed_at) {
      return res.status(200).json({ success: true, alreadyResumed: true });
    }
    const { error } = await supabase.from('school_contracts').update({
      suspension_resumed_at: nowIso,
      suspension_resumed_by: admin.access.userId,
    }).eq('id', contract.id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true, resumedAt: nowIso });
  }

  const reason = String(req.body?.reason || '').trim();
  const until = String(req.body?.until || '').trim();
  if (reason.length < 3) return res.status(400).json({ error: 'Nurodykite sustabdymo priežastį.' });
  if (reason.length > 1000) return res.status(400).json({ error: 'Sustabdymo priežastis per ilga.' });
  if (until && !/^20\d{2}-\d{2}-\d{2}$/.test(until)) return res.status(400).json({ error: 'Neteisinga pabaigos data.' });

  const { error } = await supabase.from('school_contracts').update({
    suspension_started_at: nowIso,
    suspension_until: until || null,
    suspension_reason: reason,
    suspension_started_by: admin.access.userId,
    suspension_resumed_at: null,
    suspension_resumed_by: null,
  }).eq('id', contract.id);
  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ success: true, suspendedAt: nowIso, until: until || null });
}
