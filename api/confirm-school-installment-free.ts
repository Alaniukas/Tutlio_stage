import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import {
  markSchoolInstallmentPaidAndMaybeInvite,
  schoolInstallmentChargeEur,
} from './_lib/schoolBookingInvite.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  const installmentId = String(req.body?.installmentId || '').trim();
  if (!installmentId) {
    return res.status(400).json({ error: 'Missing installmentId' });
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: installment, error: installmentErr } = await supabase
      .from('school_payment_installments')
      .select('id, installment_number, amount, payment_status, contract:school_contracts(id, student_id, additional_fee_amount, archived_at)')
      .eq('id', installmentId)
      .maybeSingle();

    if (installmentErr || !installment) {
      return res.status(404).json({ error: 'Installment not found' });
    }

    const contract = (installment as any).contract;
    if (!contract) return res.status(404).json({ error: 'Contract not found' });
    if (contract.archived_at) return res.status(400).json({ error: 'Contract archived' });

    const chargeEur = schoolInstallmentChargeEur(installment, contract);
    if (chargeEur > 0) {
      return res.status(400).json({ error: 'This installment requires card payment' });
    }

    if (installment.payment_status === 'paid') {
      return res.status(200).json({ success: true, installmentId, alreadyPaid: true });
    }

    const result = await markSchoolInstallmentPaidAndMaybeInvite(supabase, installmentId, {
      serviceRoleKey,
      studentId: contract.student_id,
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Failed to confirm free installment' });
    }

    return res.status(200).json({
      success: true,
      installmentId,
      invitesSent: result.invitesSent === true,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'Failed to confirm free installment' });
  }
}
