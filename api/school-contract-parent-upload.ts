/**
 * Smart-ID (Dokobit) alternative for parents: the parent downloads the current
 * contract PDF, signs it outside GoSign (any PAdES-capable portal), and uploads
 * the signed PDF back here. Two-step to stay under Vercel's request body limit:
 *   POST { token, action: 'upload-url' }        → Storage signed-upload URL
 *   POST { token, action: 'finalize', path }    → validate + advance contract
 *
 * Validation is offline and deterministic (see pdfSignatureCheck): the upload
 * must be a PDF, must be a PAdES incremental update of the exact PDF this
 * signer was given, and must contain a new signature. When all checks pass the
 * signature row is marked signed automatically and the contract advances the
 * same way as after a GoSign signature.
 *
 * Access is authorized purely by the unguessable per-signer token; works even
 * when GoSign credentials are absent (signing happens elsewhere).
 */
import type { VercelRequest, VercelResponse } from './types';
import { createClient } from '@supabase/supabase-js';
import { publicOriginFromRequest } from './_lib/public-origin.js';
import { supabaseServiceRoleClientOptions } from './_lib/supabaseServiceRoleClientOptions.js';
import {
  CONTRACT_SIGN_SELECT,
  advanceAfterRoleSigned,
  downloadPdfBytes,
  fetchSignatureRows,
  inputPdfPathForRole,
  isSignatureTokenExpired,
  renewParentSignatureAccess,
  signedPdfPathForRole,
  uploadSignedPdf,
} from './_lib/schoolContractSigning.js';
import type { SignerRole } from './_lib/gosignConfig.js';
import { SCHOOL_CONTRACTS_BUCKET } from './_lib/schoolContractPdfPath.js';
import { validateUploadedSignedPdf } from './_lib/pdfSignatureCheck.js';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const REJECTION_MESSAGES: Record<string, string> = {
  not_pdf: 'Įkeltas failas nėra PDF. Jei pasirašėte ADOC/ASiC formatu — grįžkite į Dokobit ir pasirinkite PDF formatą.',
  not_incremental:
    'Įkėlėte ne tą failą arba pakeistą versiją. Atsisiųskite sutartį iš šio puslapio, pasirašykite ją Dokobit PDF formatu ir įkelkite gautą failą.',
  no_new_signature: 'Šiame PDF naujo parašo nėra — panašu, kad įkėlėte dar nepasirašytą sutartį. Pirmiausia pasirašykite ją Dokobit portale.',
};

function json(res: VercelResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return json(res, 500, { error: 'Server misconfigured' });
  const supabase = createClient(supabaseUrl, serviceRoleKey, supabaseServiceRoleClientOptions());

  const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
  const action = typeof req.body?.action === 'string' ? req.body.action.trim() : '';
  if (!token) return json(res, 400, { error: 'Missing token' });
  if (action !== 'upload-url' && action !== 'finalize') return json(res, 400, { error: 'Unknown action' });

  const { data: rowRaw } = await supabase
    .from('school_contract_signatures')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  if (!rowRaw || !String(rowRaw.role).startsWith('parent')) return json(res, 404, { error: 'Invalid link' });

  const { data: contract } = await supabase
    .from('school_contracts')
    .select(CONTRACT_SIGN_SELECT)
    .eq('id', rowRaw.contract_id)
    .maybeSingle();
  if (!contract) return json(res, 404, { error: 'Contract not found' });
  if (!(contract as any).organizations?.features?.school_contract_esign) {
    return json(res, 403, { error: 'E-signing is not enabled for this organization' });
  }

  const ready = String((contract as any).signing_status) === 'signed_by_school';
  let row = rowRaw;
  if (row.status !== 'signed' && ready && isSignatureTokenExpired(row)) {
    row = await renewParentSignatureAccess(supabase, row);
  }

  if (row.status === 'signed') return json(res, 200, { alreadySigned: true });
  if (isSignatureTokenExpired(row)) {
    return json(res, 410, { error: 'Nuoroda nebegalioja. Kreipkitės į mokyklą dėl naujos.' });
  }
  if (!ready) {
    return json(res, 409, { error: 'Sutartis šiuo metu neparuošta tėvų parašui.' });
  }

  const rows = await fetchSignatureRows(supabase, String((contract as any).id));
  const inputPath = inputPdfPathForRole(contract, rows, row.role as SignerRole);
  if (!inputPath) return json(res, 409, { error: 'Sutartis dar laukia ankstesnio parašo.' });

  const uploadPath = `${(contract as any).organization_id}/contracts/${(contract as any).id}/uploads/${row.role}.pdf`;

  if (action === 'upload-url') {
    const { data: signData, error: signErr } = await supabase.storage
      .from(SCHOOL_CONTRACTS_BUCKET)
      .createSignedUploadUrl(uploadPath, { upsert: true });
    if (signErr || !signData?.signedUrl || !signData.path) {
      console.error('[school-contract-parent-upload] upload-url:', signErr?.message);
      return json(res, 503, { error: 'Nepavyko paruošti įkėlimo. Bandykite dar kartą.' });
    }
    return json(res, 200, { path: signData.path, signedUrl: signData.signedUrl });
  }

  // action === 'finalize'
  const claimedPath = typeof req.body?.path === 'string' ? req.body.path.trim() : '';
  if (claimedPath !== uploadPath) return json(res, 400, { error: 'Invalid upload path' });

  // Reject oversized objects from metadata BEFORE buffering them into memory.
  const uploadDir = uploadPath.slice(0, uploadPath.lastIndexOf('/'));
  const uploadName = uploadPath.slice(uploadPath.lastIndexOf('/') + 1);
  const { data: listed } = await supabase.storage
    .from(SCHOOL_CONTRACTS_BUCKET)
    .list(uploadDir, { search: uploadName, limit: 10 });
  const uploadedMeta = (listed || []).find((f: { name: string }) => f.name === uploadName);
  const metaSize = Number((uploadedMeta as any)?.metadata?.size ?? 0);
  if (metaSize > MAX_UPLOAD_BYTES) {
    return json(res, 413, { error: 'Failas per didelis (daugiausia 25 MB).' });
  }

  let uploaded: Buffer;
  try {
    uploaded = await downloadPdfBytes(supabase, uploadPath);
  } catch {
    return json(res, 400, { error: 'Įkelto failo nerasta. Įkelkite failą dar kartą.' });
  }
  if (uploaded.length > MAX_UPLOAD_BYTES) {
    return json(res, 413, { error: 'Failas per didelis (daugiausia 25 MB).' });
  }

  let base: Buffer;
  try {
    base = await downloadPdfBytes(supabase, inputPath);
  } catch (e: any) {
    console.error('[school-contract-parent-upload] base pdf:', e?.message || e);
    return json(res, 500, { error: 'Nepavyko patikrinti sutarties. Bandykite vėliau.' });
  }

  const verdict = validateUploadedSignedPdf(uploaded, base);
  if (verdict.ok === false) {
    return json(res, 422, { error: REJECTION_MESSAGES[verdict.reason], code: verdict.reason });
  }

  // Claim the row exactly once BEFORE touching the canonical signed file — a
  // concurrent GoSign completion or a double submit loses the race here and
  // must never overwrite the winner's stored PDF. The canonical path is
  // deterministic (mirrors uploadSignedPdf), so it can be recorded up front.
  // Clearing the GoSign fields makes "signed without a transaction" the
  // durable marker of the Smart-ID upload method.
  const signedPath = signedPdfPathForRole(
    String((contract as any).organization_id),
    String((contract as any).id),
    row.role as SignerRole,
  );
  const { data: claimedRows, error: claimErr } = await supabase
    .from('school_contract_signatures')
    .update({
      status: 'signed',
      signed_at: new Date().toISOString(),
      signed_pdf_path: signedPath,
      gosign_transaction_id: null,
      signing_url: null,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .neq('status', 'signed')
    .select('id');
  if (claimErr) {
    console.error('[school-contract-parent-upload] claim:', claimErr.message);
    return json(res, 500, { error: 'Nepavyko išsaugoti parašo būsenos. Bandykite dar kartą.' });
  }
  if (!claimedRows || claimedRows.length === 0) return json(res, 200, { alreadySigned: true });

  try {
    await uploadSignedPdf(supabase, {
      organizationId: String((contract as any).organization_id),
      contractId: String((contract as any).id),
      role: row.role as SignerRole,
      bytes: uploaded,
    });
  } catch (e: any) {
    console.error('[school-contract-parent-upload] store:', e?.message || e);
    // Roll the row back to its pre-claim state so the parent can retry cleanly.
    await supabase
      .from('school_contract_signatures')
      .update({
        status: row.status,
        signed_at: row.signed_at ?? null,
        signed_pdf_path: row.signed_pdf_path ?? null,
        gosign_transaction_id: row.gosign_transaction_id ?? null,
        signing_url: row.signing_url ?? null,
        error_message: row.error_message ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    return json(res, 500, { error: 'Nepavyko išsaugoti pasirašytos sutarties. Bandykite dar kartą.' });
  }

  try {
    const adv = await advanceAfterRoleSigned(
      supabase,
      contract,
      row.role as SignerRole,
      signedPath,
      publicOriginFromRequest(req),
    );
    // Best-effort tmp cleanup — the canonical copy lives under signed/.
    await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET).remove([uploadPath]).catch(() => undefined);
    return json(res, 200, {
      ok: true,
      signed: true,
      done: adv.done,
      addedSignatures: verdict.addedSignatures,
      signerNames: verdict.signerNames.slice(0, 3),
    });
  } catch (e: any) {
    console.error('[school-contract-parent-upload] advance:', e?.message || e);
    // The signature itself is recorded; the reconcile/return flows are
    // idempotent, so surface success with a soft warning instead of failing.
    return json(res, 200, { ok: true, signed: true, done: false, warning: 'advance_incomplete' });
  }
}
