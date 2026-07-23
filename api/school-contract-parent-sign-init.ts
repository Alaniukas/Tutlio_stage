/**
 * Parent signing entry (no account). Reached via the safe link in the invite
 * email: /school-sign?token=…  The SPA calls:
 *   GET  → contract summary to render the page
 *   POST → begin the GoSign transaction; returns the signing URL to redirect to
 * Access is authorized purely by the unguessable per-signer token.
 */
import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { isGoSignConfigured, goSignNotConfiguredMessage } from './_lib/gosignConfig.js';
import { publicOriginFromRequest } from './_lib/public-origin.js';
import {
  CONTRACT_SIGN_SELECT,
  beginGoSignForRow,
  contractPdfFileName,
  fetchSignatureRows,
  inputPdfPathForRole,
} from './_lib/schoolContractSigning.js';
import { SCHOOL_CONTRACTS_BUCKET, extractSchoolContractStoragePath } from './_lib/schoolContractPdfPath.js';

function json(res: VercelResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!isGoSignConfigured()) return json(res, 503, { error: goSignNotConfiguredMessage() });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return json(res, 500, { error: 'Server misconfigured' });
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const token =
    req.method === 'GET'
      ? String((req.query.token as string) || '').trim()
      : typeof req.body?.token === 'string'
        ? req.body.token.trim()
        : '';
  if (!token) return json(res, 400, { error: 'Missing token' });

  const { data: row } = await supabase
    .from('school_contract_signatures')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  if (!row || !String(row.role).startsWith('parent')) return json(res, 404, { error: 'Invalid link' });

  const { data: contract } = await supabase
    .from('school_contracts')
    .select(CONTRACT_SIGN_SELECT)
    .eq('id', row.contract_id)
    .maybeSingle();
  if (!contract) return json(res, 404, { error: 'Contract not found' });
  if (!(contract as any).organizations?.features?.school_contract_esign) {
    return json(res, 403, { error: 'E-signing is not enabled for this organization' });
  }

  const st = (contract as any).student || {};
  const expired = row.token_expires_at && new Date(row.token_expires_at).getTime() < Date.now();

  if (req.method === 'GET') {
    const ready = String((contract as any).signing_status) === 'signed_by_school';
    // Download link for the Smart-ID (Dokobit) path: the exact PDF this signer
    // must sign (the previous signer's output).
    let pdfUrl: string | undefined;
    if (ready && row.status !== 'signed' && !expired) {
      const rows = await fetchSignatureRows(supabase, String((contract as any).id));
      const inputPath = inputPdfPathForRole(contract, rows, row.role);
      if (inputPath) {
        const { data: signed } = await supabase.storage
          .from(SCHOOL_CONTRACTS_BUCKET)
          // Stored objects are named school.pdf/parent_primary.pdf — download
          // with the contract's human filename so the Dokobit document the
          // parent creates isn't titled "school".
          .createSignedUrl(extractSchoolContractStoragePath(inputPath), 60 * 60, {
            download: contractPdfFileName(contract),
          });
        pdfUrl = signed?.signedUrl || undefined;
      }
    }
    return json(res, 200, {
      studentName: st.full_name || '',
      schoolName: (contract as any).organizations?.name || '',
      signerName: row.signer_name || '',
      status: row.status,
      alreadySigned: row.status === 'signed',
      expired: Boolean(expired),
      ready,
      pdfUrl,
    });
  }

  // POST → begin signing
  if (row.status === 'signed') return json(res, 200, { alreadySigned: true });
  if (expired) return json(res, 410, { error: 'Signing link expired' });
  if (String((contract as any).signing_status) !== 'signed_by_school') {
    return json(res, 409, { error: 'Contract is not ready for parent signature yet' });
  }

  try {
    const signingUrl = await beginGoSignForRow(supabase, contract, row, publicOriginFromRequest(req));
    return json(res, 200, { signingUrl });
  } catch (e: any) {
    console.error('[school-contract-parent-sign-init]', e?.message || e);
    return json(res, 502, { error: `Could not start signing: ${e?.message || 'unknown error'}` });
  }
}
