/**
 * School-contract e-signing orchestration (GoSign OneSign).
 *
 * Two-party signing = sequential OneSign transactions on the same evolving PDF:
 *   school (directorė) signs contract.pdf_url  → school.signed_pdf_path
 *   parent_primary signs school.signed_pdf_path → parent_primary.signed_pdf_path
 *   parent_secondary (optional) signs that      → final
 * The final signed PDF is copied to school_contracts.signed_contract_url and the
 * contract moves to signing_status = 'signed' (which the payment flow gates on).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { initOneSign, pollSigningResult } from './gosignClient.js';
import { fileDigestBase64 } from './gosign.js';
import { signaturePositionForRole, type SignerRole } from './gosignConfig.js';
import {
  SCHOOL_CONTRACTS_BUCKET,
  extractSchoolContractStoragePath,
  sanitizeContractNumberForFilename,
} from './schoolContractPdfPath.js';

export const SIGNATURE_TOKEN_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export const CONTRACT_SIGN_SELECT =
  'id, organization_id, student_id, signing_status, pdf_url, signed_contract_url, contract_number, require_second_parent, ' +
  'organizations(name, features), ' +
  'student:students(id, full_name, payer_name, payer_email, parent_secondary_name, parent_secondary_email)';

export const ROLE_ORDER: Record<SignerRole, number> = { school: 0, parent_primary: 1, parent_secondary: 2 };

export function randomSignToken(): string {
  return `${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
}

function contractPdfFileName(contract: any): string {
  const slug = sanitizeContractNumberForFilename(contract?.contract_number || '');
  return `${slug ? `Sutartis-${slug}` : 'Sutartis'}.pdf`;
}

/** Download a stored (private-bucket) PDF to a Buffer. */
export async function downloadPdfBytes(supabase: SupabaseClient, storedPathOrUrl: string): Promise<Buffer> {
  const path = extractSchoolContractStoragePath(storedPathOrUrl);
  const { data, error } = await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET).download(path);
  if (error || !data) throw new Error(`Could not read contract PDF (${path}): ${error?.message || 'not found'}`);
  return Buffer.from(await data.arrayBuffer());
}

/** Store a signer's resulting PDF; overwrites per (contract, role). */
export async function uploadSignedPdf(
  supabase: SupabaseClient,
  params: { organizationId: string; contractId: string; role: SignerRole; bytes: Buffer },
): Promise<string> {
  const path = `${params.organizationId}/contracts/${params.contractId}/signed/${params.role}.pdf`;
  const { error } = await supabase.storage
    .from(SCHOOL_CONTRACTS_BUCKET)
    .upload(path, new Blob([params.bytes], { type: 'application/pdf' }), {
      cacheControl: '3600',
      upsert: true,
      contentType: 'application/pdf',
    });
  if (error) throw new Error(`Could not store signed PDF: ${error.message}`);
  return path;
}

async function fetchSignatureRows(supabase: SupabaseClient, contractId: string): Promise<any[]> {
  const { data } = await supabase
    .from('school_contract_signatures')
    .select('*')
    .eq('contract_id', contractId);
  return data || [];
}

/** Resolve the input PDF a signer must sign (the previous signer's output). */
function inputPdfPathForRole(contract: any, rows: any[], role: SignerRole): string {
  if (role === 'school') return String(contract.pdf_url || '');
  if (role === 'parent_primary') {
    return String(rows.find((r) => r.role === 'school')?.signed_pdf_path || '');
  }
  // parent_secondary signs the primary parent's output.
  return String(rows.find((r) => r.role === 'parent_primary')?.signed_pdf_path || '');
}

/**
 * Kick off a GoSign transaction for an (existing) signature row and record the
 * transactionId + signingUrl. Returns the URL the browser must be redirected to.
 */
export async function beginGoSignForRow(
  supabase: SupabaseClient,
  contract: any,
  row: any,
  appOrigin: string,
): Promise<string> {
  const rows = await fetchSignatureRows(supabase, contract.id);
  const inputPath = inputPdfPathForRole(contract, rows, row.role);
  if (!inputPath) throw new Error(`No input PDF available for role ${row.role}`);

  const bytes = await downloadPdfBytes(supabase, inputPath);
  const content = bytes.toString('base64');
  const fileDigest = fileDigestBase64(bytes);
  const responseUrl = `${appOrigin.replace(/\/$/, '')}/school-sign/return?token=${encodeURIComponent(row.token)}`;

  const result = await initOneSign({
    responseUrl,
    signingType: 'Signature',
    locale: 'lt',
    position: signaturePositionForRole(row.role as SignerRole),
    signerPersonalCode: row.signer_personal_code || undefined,
    mobileSigningText: 'Tutlio: ugdymo sutarties pasirašymas',
    file: {
      fileId: `${contract.id}:${row.role}`.slice(0, 128),
      fileDigest,
      fileName: contractPdfFileName(contract),
      content,
    },
  });

  await supabase
    .from('school_contract_signatures')
    .update({
      gosign_transaction_id: String(result.transactionId),
      signing_url: result.signingUrl,
      status: 'in_progress',
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id);

  return result.signingUrl;
}

/** Insert (or reuse) a signature row for a role, minting a safe-link token. */
export async function ensureSignatureRow(
  supabase: SupabaseClient,
  params: {
    contractId: string;
    role: SignerRole;
    signerName?: string | null;
    signerEmail?: string | null;
    signerPersonalCode?: string | null;
  },
): Promise<any> {
  const existing = (await fetchSignatureRows(supabase, params.contractId)).find((r) => r.role === params.role);
  if (existing) return existing;

  const token = randomSignToken();
  const { data, error } = await supabase
    .from('school_contract_signatures')
    .insert({
      contract_id: params.contractId,
      role: params.role,
      order_index: ROLE_ORDER[params.role],
      signer_name: params.signerName ?? null,
      signer_email: params.signerEmail ?? null,
      signer_personal_code: params.signerPersonalCode ?? null,
      status: 'pending',
      token,
      token_expires_at: new Date(Date.now() + SIGNATURE_TOKEN_TTL_MS).toISOString(),
    })
    .select('*')
    .single();
  if (error) throw new Error(`Could not create signature row (${params.role}): ${error.message}`);
  return data;
}

/** Best-effort internal email via /api/send-email. */
async function sendInternalEmail(
  appOrigin: string,
  type: string,
  to: string,
  data: Record<string, unknown>,
): Promise<void> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey || !to) return;
  try {
    await fetch(`${appOrigin.replace(/\/$/, '')}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': serviceKey },
      body: JSON.stringify({ type, to, data }),
    });
  } catch (e) {
    console.error('[schoolContractSigning] email send failed:', (e as Error)?.message);
  }
}

function parentSignUrl(appOrigin: string, token: string): string {
  return `${appOrigin.replace(/\/$/, '')}/school-sign?token=${encodeURIComponent(token)}`;
}

export interface ReturnResult {
  status: 'pending' | 'in_progress' | 'signed' | 'canceled' | 'expired' | 'not_found';
  role?: SignerRole;
  contractStatus?: string;
  done?: boolean;
}

/**
 * Poll the GoSign transaction for the row identified by `token`, and on success
 * persist the signed PDF and advance the contract to the next signer / to done.
 * Idempotent: safe to call repeatedly from the SPA return page.
 */
export async function pollAndAdvance(
  supabase: SupabaseClient,
  token: string,
  appOrigin: string,
): Promise<ReturnResult> {
  const { data: row } = await supabase
    .from('school_contract_signatures')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  if (!row) return { status: 'not_found' };

  const { data: contract } = await supabase
    .from('school_contracts')
    .select(CONTRACT_SIGN_SELECT)
    .eq('id', row.contract_id)
    .maybeSingle();
  if (!contract) return { status: 'not_found' };

  if (row.status === 'signed') {
    return { status: 'signed', role: row.role, contractStatus: (contract as any).signing_status };
  }
  if (row.token_expires_at && new Date(row.token_expires_at).getTime() < Date.now()) {
    return { status: 'expired', role: row.role };
  }
  if (!row.gosign_transaction_id) {
    return { status: 'pending', role: row.role, contractStatus: (contract as any).signing_status };
  }

  const result = await pollSigningResult(row.gosign_transaction_id);
  if (result.status === 'InProgress') return { status: 'in_progress', role: row.role };
  if (result.status === 'Canceled') {
    await supabase
      .from('school_contract_signatures')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
      .eq('id', row.id);
    return { status: 'canceled', role: row.role };
  }

  // Signed — persist the returned PDF and record signer details.
  if (!result.signedFileContent) throw new Error('GoSign returned Signed without a document');
  const signedBytes = Buffer.from(result.signedFileContent, 'base64');
  const signedPath = await uploadSignedPdf(supabase, {
    organizationId: String((contract as any).organization_id),
    contractId: String((contract as any).id),
    role: row.role,
    bytes: signedBytes,
  });
  await supabase
    .from('school_contract_signatures')
    .update({
      status: 'signed',
      signed_at: new Date().toISOString(),
      signed_pdf_path: signedPath,
      signer_certificate: result.signerCertificate ?? null,
      signer_certificate_trusted: result.signerCertificateTrusted ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id);

  const st = (contract as any).student || {};
  const contractId = String((contract as any).id);

  if (row.role === 'school') {
    await supabase
      .from('school_contracts')
      .update({ signing_status: 'signed_by_school' })
      .eq('id', contractId);
    // Invite the primary parent to sign the school-signed PDF.
    const parentRow = await ensureSignatureRow(supabase, {
      contractId,
      role: 'parent_primary',
      signerName: st.payer_name,
      signerEmail: st.payer_email,
    });
    await sendInternalEmail(appOrigin, 'school_contract_sign_request', String(st.payer_email || ''), {
      parentName: st.payer_name || '',
      studentName: st.full_name || '',
      schoolName: (contract as any).organizations?.name || '',
      signUrl: parentSignUrl(appOrigin, parentRow.token),
      locale: 'lt',
      organizationId: (contract as any).organization_id,
    });
    return { status: 'signed', role: row.role, contractStatus: 'signed_by_school' };
  }

  if (row.role === 'parent_primary') {
    const needSecond =
      Boolean((contract as any).require_second_parent) && Boolean(String(st.parent_secondary_email || '').trim());
    if (needSecond) {
      const p2 = await ensureSignatureRow(supabase, {
        contractId,
        role: 'parent_secondary',
        signerName: st.parent_secondary_name,
        signerEmail: st.parent_secondary_email,
      });
      await sendInternalEmail(appOrigin, 'school_contract_sign_request', String(st.parent_secondary_email || ''), {
        parentName: st.parent_secondary_name || '',
        studentName: st.full_name || '',
        schoolName: (contract as any).organizations?.name || '',
        signUrl: parentSignUrl(appOrigin, p2.token),
        locale: 'lt',
        organizationId: (contract as any).organization_id,
      });
      return { status: 'signed', role: row.role, contractStatus: 'signed_by_school' };
    }
    await finalizeContract(supabase, contract, signedPath, appOrigin);
    return { status: 'signed', role: row.role, contractStatus: 'signed', done: true };
  }

  // parent_secondary
  await finalizeContract(supabase, contract, signedPath, appOrigin);
  return { status: 'signed', role: row.role, contractStatus: 'signed', done: true };
}

async function finalizeContract(
  supabase: SupabaseClient,
  contract: any,
  finalSignedPath: string,
  appOrigin: string,
): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from('school_contracts')
    .update({
      signing_status: 'signed',
      signed_contract_url: finalSignedPath,
      signed_at: now,
      signed_uploaded_at: now,
    })
    .eq('id', contract.id);

  const st = contract.student || {};
  await sendInternalEmail(appOrigin, 'school_contract_fully_signed', String(st.payer_email || ''), {
    parentName: st.payer_name || '',
    studentName: st.full_name || '',
    schoolName: contract.organizations?.name || '',
    locale: 'lt',
    organizationId: contract.organization_id,
  });
}
