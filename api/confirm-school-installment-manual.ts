import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { markSchoolInstallmentPaidAndMaybeInvite } from './_lib/schoolBookingInvite.js';

function json(res: VercelResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const auth = await verifyRequestAuth(req);
  if (!auth || auth.isInternal || !auth.userId) return json(res, 401, { error: 'Unauthorized' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return json(res, 500, { error: 'Server misconfigured' });

  const installmentId = String(req.body?.installmentId || '').trim();
  if (!installmentId) return json(res, 400, { error: 'Missing installmentId' });

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: installment, error: installmentErr } = await supabase
    .from('school_payment_installments')
    .select(
      'id, payment_status, contract:school_contracts(id, organization_id, student_id, archived_at)',
    )
    .eq('id', installmentId)
    .maybeSingle();

  if (installmentErr || !installment) return json(res, 404, { error: 'Installment not found' });

  const contract = (installment as any).contract;
  if (!contract) return json(res, 404, { error: 'Contract not found' });
  if (contract.archived_at) return json(res, 400, { error: 'Contract archived' });

  const orgId = String(contract.organization_id || '').trim();
  if (!orgId) return json(res, 500, { error: 'Contract missing organization_id' });

  const { data: adminRow } = await supabase
    .from('organization_admins')
    .select('id')
    .eq('user_id', auth.userId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!adminRow) return json(res, 403, { error: 'Forbidden' });

  if (installment.payment_status === 'paid') {
    return json(res, 200, { success: true, installmentId, alreadyPaid: true });
  }

  const result = await markSchoolInstallmentPaidAndMaybeInvite(supabase, installmentId, {
    serviceRoleKey,
    studentId: String(contract.student_id || '').trim() || null,
  });

  if (!result.success) {
    return json(res, result.error === 'Installment not found' ? 404 : 500, { error: result.error });
  }

  return json(res, 200, {
    success: true,
    installmentId,
    invitesSent: result.invitesSent === true,
  });
}
