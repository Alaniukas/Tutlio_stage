/**
 * Admin escape hatch for e-sign contracts stuck waiting for a parent signature
 * that verifiably happened OUTSIDE the Tutlio flow (e.g. the parent signed the
 * PDF in their own Dokobit account and never uploaded it back).
 *
 * Org-admin-authenticated. Operates on the first actionable parent role of a
 * 'signed_by_school' contract. Three actions:
 *   POST { contractId, action: 'status' }      → which role is pending + upload path info
 *   POST { contractId, action: 'upload-url' }  → Storage signed-upload URL for the signed PDF
 *   POST { contractId, action: 'finalize', path?, confirmNoFile? }
 *     - with path: validate the uploaded PDF exactly like the parent Smart-ID
 *       path (PAdES incremental update of the signer's input PDF + a new
 *       signature) → the parent's real signatures end up in the final contract;
 *     - without path (confirmNoFile: true): mark the signature received with NO
 *       document evidence — the contract finalizes with the newest PDF Tutlio
 *       already holds (the parent's signature will NOT be visible in the file).
 * Both variants record manually_marked_by/at and advance the contract the same
 * way as a normal signature (next invite / finalize + emails).
 */
import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { verifyRequestAuth } from './_lib/auth.js';
import { publicOriginFromRequest } from './_lib/public-origin.js';
import { supabaseServiceRoleClientOptions } from './_lib/supabaseServiceRoleClientOptions.js';
import {
  CONTRACT_SIGN_SELECT,
  advanceAfterRoleSigned,
  downloadPdfBytes,
  ensureSignatureRow,
  fetchSignatureRows,
  inputPdfPathForRole,
  pendingParentRole,
  signedPdfPathForRole,
  uploadSignedPdf,
} from './_lib/schoolContractSigning.js';
import { SCHOOL_CONTRACTS_BUCKET } from './_lib/schoolContractPdfPath.js';
import { validateUploadedSignedPdf } from './_lib/pdfSignatureCheck.js';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const REJECTION_MESSAGES: Record<string, string> = {
  not_pdf: 'Įkeltas failas nėra PDF. Jei pasirašyta ADOC/ASiC formatu — Dokobit atsisiųskite būtent PDF.',
  not_incremental:
    'Nepavyko atpažinti šios sutarties parašo faile. Reikia Dokobit PDF, pasirašyto ant Tutlio išduotos sutarties versijos.',
  no_new_signature: 'Šiame PDF naujo parašo nėra — panašu, kad įkelta dar nepasirašyta sutartis.',
};

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
  const supabase = createClient(supabaseUrl, serviceRoleKey, supabaseServiceRoleClientOptions());

  const contractId = typeof req.body?.contractId === 'string' ? req.body.contractId.trim() : '';
  const action = typeof req.body?.action === 'string' ? req.body.action.trim() : '';
  if (!contractId) return json(res, 400, { error: 'Missing contractId' });
  if (action !== 'status' && action !== 'upload-url' && action !== 'finalize') {
    return json(res, 400, { error: 'Unknown action' });
  }

  const { data: contract } = await supabase
    .from('school_contracts')
    .select(CONTRACT_SIGN_SELECT)
    .eq('id', contractId)
    .maybeSingle();
  if (!contract) return json(res, 404, { error: 'Contract not found' });

  const orgId = String((contract as any).organization_id || '');
  const { data: adminRow } = await supabase
    .from('organization_admins')
    .select('id')
    .eq('user_id', auth.userId)
    .eq('organization_id', orgId)
    .maybeSingle();
  if (!adminRow) return json(res, 403, { error: 'Forbidden' });

  if ((contract as any).organizations?.features?.school_contract_esign !== true) {
    return json(res, 409, { error: 'Šiai organizacijai e-pasirašymas neįjungtas — naudokite įprastą žymėjimą.' });
  }
  if (String((contract as any).signing_status) !== 'signed_by_school') {
    return json(res, 409, { error: 'Ranka pažymėti galima tik kai mokykla jau pasirašė, o laukiama tėvų parašo.' });
  }

  // Resolve the first actionable parent role (mirrors advanceAfterRoleSigned).
  const st = (contract as any).student || {};
  const rows = await fetchSignatureRows(supabase, contractId);
  const role = pendingParentRole(contract, rows);
  if (!role) return json(res, 409, { error: 'Nebėra laukiančių tėvų parašų.' });

  const row = await ensureSignatureRow(supabase, {
    contractId,
    role,
    signerName: role === 'parent_primary' ? st.payer_name : st.parent_secondary_name,
    signerEmail: role === 'parent_primary' ? st.payer_email : st.parent_secondary_email,
    signerPersonalCode: role === 'parent_primary' ? st.payer_personal_code : st.parent_secondary_personal_code,
  });

  const inputPath = inputPdfPathForRole(contract, rows, role);
  if (!inputPath) return json(res, 409, { error: 'Sutartis dar laukia ankstesnio parašo.' });

  if (action === 'status') {
    return json(res, 200, { role, signerName: row.signer_name || '', signerEmail: row.signer_email || '' });
  }

  const uploadPath = `${orgId}/contracts/${contractId}/uploads/manual-${role}.pdf`;

  if (action === 'upload-url') {
    const { data: signData, error: signErr } = await supabase.storage
      .from(SCHOOL_CONTRACTS_BUCKET)
      .createSignedUploadUrl(uploadPath, { upsert: true });
    if (signErr || !signData?.signedUrl || !signData.path) {
      console.error('[school-contract-esign-mark-signed] upload-url:', signErr?.message);
      return json(res, 503, { error: 'Nepavyko paruošti įkėlimo. Bandykite dar kartą.' });
    }
    return json(res, 200, { role, path: signData.path, signedUrl: signData.signedUrl });
  }

  // action === 'finalize'
  const claimedPath = typeof req.body?.path === 'string' ? req.body.path.trim() : '';
  const confirmNoFile = req.body?.confirmNoFile === true;
  if (!claimedPath && !confirmNoFile) {
    return json(res, 400, { error: 'Pridėkite pasirašytą PDF arba patvirtinkite žymėjimą be failo.' });
  }

  let signedPath = inputPath; // no-file: the chain continues on the newest stored PDF
  let uploadedBytes: Buffer | null = null;
  let verdictMeta: { addedSignatures: number; signerNames: string[] } | null = null;

  if (claimedPath) {
    if (claimedPath !== uploadPath) return json(res, 400, { error: 'Invalid upload path' });
    try {
      uploadedBytes = await downloadPdfBytes(supabase, uploadPath);
    } catch {
      return json(res, 400, { error: 'Įkelto failo nerasta. Įkelkite failą dar kartą.' });
    }
    if (uploadedBytes.length > MAX_UPLOAD_BYTES) {
      return json(res, 413, { error: 'Failas per didelis (daugiausia 25 MB).' });
    }
    let base: Buffer;
    try {
      base = await downloadPdfBytes(supabase, inputPath);
    } catch (e: any) {
      console.error('[school-contract-esign-mark-signed] base pdf:', e?.message || e);
      return json(res, 500, { error: 'Nepavyko patikrinti sutarties. Bandykite vėliau.' });
    }
    const verdict = validateUploadedSignedPdf(uploadedBytes, base);
    if (verdict.ok === false) {
      return json(res, 422, { error: REJECTION_MESSAGES[verdict.reason], code: verdict.reason });
    }
    verdictMeta = { addedSignatures: verdict.addedSignatures, signerNames: verdict.signerNames.slice(0, 3) };
    signedPath = signedPdfPathForRole(orgId, contractId, role);
  }

  // Claim the row exactly once (same race guard as the parent upload path): a
  // concurrent GoSign completion or parent upload wins and we bail out.
  const { data: claimedRows, error: claimErr } = await supabase
    .from('school_contract_signatures')
    .update({
      status: 'signed',
      signed_at: new Date().toISOString(),
      signed_pdf_path: signedPath,
      gosign_transaction_id: null,
      signing_url: null,
      error_message: null,
      manually_marked_by: auth.userId,
      manually_marked_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .neq('status', 'signed')
    .select('id');
  if (claimErr) {
    console.error('[school-contract-esign-mark-signed] claim:', claimErr.message);
    return json(res, 500, { error: 'Nepavyko išsaugoti parašo būsenos. Bandykite dar kartą.' });
  }
  if (!claimedRows || claimedRows.length === 0) return json(res, 200, { alreadySigned: true, role });

  if (uploadedBytes) {
    try {
      await uploadSignedPdf(supabase, { organizationId: orgId, contractId, role, bytes: uploadedBytes });
    } catch (e: any) {
      console.error('[school-contract-esign-mark-signed] store:', e?.message || e);
      // Roll the row back to its pre-claim state so the admin can retry cleanly.
      await supabase
        .from('school_contract_signatures')
        .update({
          status: row.status,
          signed_at: row.signed_at ?? null,
          signed_pdf_path: row.signed_pdf_path ?? null,
          gosign_transaction_id: row.gosign_transaction_id ?? null,
          signing_url: row.signing_url ?? null,
          error_message: row.error_message ?? null,
          manually_marked_by: null,
          manually_marked_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      return json(res, 500, { error: 'Nepavyko išsaugoti pasirašytos sutarties. Bandykite dar kartą.' });
    }
  }

  try {
    const adv = await advanceAfterRoleSigned(supabase, contract, role, signedPath, publicOriginFromRequest(req));
    if (uploadedBytes) {
      await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET).remove([uploadPath]).catch(() => undefined);
    }
    return json(res, 200, {
      ok: true,
      role,
      done: adv.done,
      withFile: Boolean(uploadedBytes),
      addedSignatures: verdictMeta?.addedSignatures,
      signerNames: verdictMeta?.signerNames,
    });
  } catch (e: any) {
    console.error('[school-contract-esign-mark-signed] advance:', e?.message || e);
    // The signature row is recorded; reconcile/refresh flows are idempotent.
    return json(res, 200, { ok: true, role, done: false, withFile: Boolean(uploadedBytes), warning: 'advance_incomplete' });
  }
}
