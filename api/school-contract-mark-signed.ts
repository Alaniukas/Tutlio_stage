import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';

function json(res: VercelResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const auth = await verifyRequestAuth(req);
  if (!auth || auth.isInternal || !auth.userId) return json(res, 401, { error: 'Unauthorized' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return json(res, 500, { error: 'Server misconfigured' });
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const contractId = typeof req.body?.contractId === 'string' ? req.body.contractId.trim() : '';
  if (!contractId) return json(res, 400, { error: 'Missing contractId' });

  const { data: contract, error: contractErr } = await supabase
    .from('school_contracts')
    .select(
      'id, organization_id, student_id, signing_status, signed_at, org:organizations(name, features), student:students(id, full_name, email, invite_code, payer_email, payer_name, parent_secondary_email, parent_secondary_name)',
    )
    .eq('id', contractId)
    .maybeSingle();

  if (contractErr || !contract) return json(res, 404, { error: 'Contract not found' });

  const orgId = String((contract as any).organization_id || '').trim();
  if (!orgId) return json(res, 500, { error: 'Contract missing organization_id' });

  const { data: adminRow } = await supabase
    .from('organization_admins')
    .select('id')
    .eq('user_id', auth.userId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!adminRow) return json(res, 403, { error: 'Forbidden' });

  if ((contract as any).org?.features?.school_contract_esign === true) {
    return json(res, 409, { error: 'Šios organizacijos sutartys pasirašomos tik per Tutlio GoSign srautą.' });
  }

  // Mark signed (idempotent).
  const updatePayload: Record<string, unknown> = { signing_status: 'signed' };
  if (!(contract as any).signed_at) updatePayload.signed_at = new Date().toISOString();
  await supabase.from('school_contracts').update(updatePayload).eq('id', contractId);

  const student = (contract as any).student || {};

  // Ensure invite code exists for later Stripe payment flow; do not email here.
  // Child booking invite → first paid Stripe installment (confirm-school-installment-payment).
  // Parent portal invite → admin "Pakviesti tėvą" only.
  let inviteCode = String(student.invite_code || '').trim();
  if (!inviteCode) {
    inviteCode = generateInviteCode();
    await supabase.from('students').update({ invite_code: inviteCode }).eq('id', String(student.id || (contract as any).student_id));
  }

  return json(res, 200, {
    success: true,
    contractId,
    inviteCode,
    alreadySigned: (contract as any).signing_status === 'signed',
  });
}
