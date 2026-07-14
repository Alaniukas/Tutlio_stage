/**
 * Directorė initiates her (in-app) signature on a school contract.
 * Auth: org admin. Returns the GoSign signing URL to redirect the browser to.
 */
import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { isGoSignConfigured, goSignNotConfiguredMessage } from './_lib/gosignConfig.js';
import { publicOriginFromRequest } from './_lib/public-origin.js';
import { CONTRACT_SIGN_SELECT, ensureSignatureRow, beginGoSignForRow } from './_lib/schoolContractSigning.js';

function json(res: VercelResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!isGoSignConfigured()) return json(res, 503, { error: goSignNotConfiguredMessage() });

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

  // Scope: e-signing must be explicitly enabled for this org (per-org feature
  // flag) — currently only VšĮ „Laisvi vaikai".
  if (!(contract as any).organizations?.features?.school_contract_esign) {
    return json(res, 403, { error: 'E-signing is not enabled for this organization' });
  }

  const orgId = String((contract as any).organization_id || '');
  const { data: adminRow } = await supabase
    .from('organization_admins')
    .select('id')
    .eq('user_id', auth.userId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!adminRow) return json(res, 403, { error: 'Forbidden' });

  const status = String((contract as any).signing_status || '');
  // Parent review/confirmation is mandatory, even when no fields were missing.
  // Only the completion endpoint advances the contract to this state.
  if (status !== 'awaiting_school_signature') {
    return json(res, 409, { error: `Contract not ready for school signature (status: ${status})` });
  }
  if (!String((contract as any).pdf_url || '').trim()) {
    return json(res, 409, { error: 'Contract has no generated PDF to sign yet' });
  }

  try {
    const row = await ensureSignatureRow(supabase, {
      contractId,
      role: 'school',
      signerName: (contract as any).organizations?.name || null,
    });
    if (row.status === 'signed') return json(res, 409, { error: 'School already signed' });

    // Mark the contract as in the school-signing stage before redirecting.
    await supabase
      .from('school_contracts')
      .update({ signing_status: 'awaiting_school_signature' })
      .eq('id', contractId);

    const signingUrl = await beginGoSignForRow(supabase, contract, row, publicOriginFromRequest(req));
    return json(res, 200, { signingUrl });
  } catch (e: any) {
    console.error('[school-contract-sign-init]', e?.message || e);
    return json(res, 502, { error: `Could not start signing: ${e?.message || 'unknown error'}` });
  }
}
