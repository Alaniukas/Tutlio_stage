/**
 * After the school has signed a teacher contract, send (or resend) the
 * teacher's signing invite. Auth: org admin with contracts.edit.
 *
 * POST { contractId, email?, name? }
 */
import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { publicOriginFromRequest } from './_lib/public-origin.js';
import { getOrgAdminAccessByUserId } from './_lib/orgAdminAccess.js';
import { hasOrgAdminPermission } from '../src/lib/orgAdminPermissions.js';
import {
  CONTRACT_SIGN_SELECT,
  fetchSignatureRows,
  inviteTeacherToSign,
  isTeacherContract,
} from './_lib/schoolContractSigning.js';

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
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const contractId = typeof req.body?.contractId === 'string' ? req.body.contractId.trim() : '';
  if (!contractId) return json(res, 400, { error: 'Missing contractId' });

  const { data: contract, error: contractErr } = await supabase
    .from('school_contracts')
    .select(CONTRACT_SIGN_SELECT)
    .eq('id', contractId)
    .maybeSingle();
  if (contractErr || !contract) return json(res, 404, { error: 'Contract not found' });
  if (!isTeacherContract(contract)) {
    return json(res, 409, { error: 'This endpoint is only for teacher contracts' });
  }
  if (!(contract as any).organizations?.features?.school_contract_esign) {
    return json(res, 403, { error: 'E-signing is not enabled for this organization' });
  }

  const orgId = String((contract as any).organization_id || '');
  const adminAccess = await getOrgAdminAccessByUserId(supabase, auth.userId);
  if (
    adminAccess?.organizationId !== orgId
    || !hasOrgAdminPermission(adminAccess?.role, adminAccess?.permissions, 'contracts.edit')
  ) return json(res, 403, { error: 'Forbidden' });

  if (String((contract as any).signing_status) === 'signed') {
    return json(res, 409, { error: 'Sutartis jau pasirašyta abiejų šalių.' });
  }
  if (String((contract as any).signing_status) !== 'signed_by_school') {
    return json(res, 409, { error: 'Mokykla turi pasirašyti sutartį prieš siunčiant pakvietimą mokytojui.' });
  }

  const rows = await fetchSignatureRows(supabase, contractId);
  if (rows.find((r: any) => r.role === 'teacher')?.status === 'signed') {
    return json(res, 409, { error: 'Mokytojas jau pasirašė.' });
  }
  const schoolSignedPath = String(rows.find((r: any) => r.role === 'school')?.signed_pdf_path || '');
  if (!schoolSignedPath) {
    return json(res, 409, { error: 'Nėra mokyklos pasirašyto PDF.' });
  }

  const email = String(req.body?.email || (contract as any).counterparty_email || '').trim();
  const name = String(req.body?.name || (contract as any).counterparty_name || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return json(res, 400, { error: 'Įveskite mokytojo el. paštą.' });
  }

  try {
    const result = await inviteTeacherToSign(
      supabase,
      { ...(contract as any), counterparty_email: email, counterparty_name: name || email },
      schoolSignedPath,
      publicOriginFromRequest(req),
      { name: name || email, email },
    );
    return json(res, 200, { ok: true, emailed: result.emailed });
  } catch (e: any) {
    console.error('[school-contract-teacher-invite]', e?.message || e);
    return json(res, 502, { error: e?.message || 'Nepavyko išsiųsti pakvietimo.' });
  }
}
