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
  'id, organization_id, student_id, signing_status, pdf_url, signed_contract_url, contract_number, require_second_parent, annual_fee, additional_fee_amount, additional_fee_purpose, ' +
  'organizations(name, email, features), ' +
  'student:students(id, full_name, payer_name, payer_email, payer_personal_code, parent_secondary_name, parent_secondary_email, parent_secondary_personal_code)';

export const ROLE_ORDER: Record<SignerRole, number> = { school: 0, parent_primary: 1, parent_secondary: 2 };

export function randomSignToken(): string {
  return `${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
}

export interface ContractSigningSettings {
  email: string;
  reason: string;
  location: string;
  contact: string;
}

function stringSetting(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Organization-controlled data used in signing emails and GoSign metadata. */
export function contractSigningSettings(contract: any): ContractSigningSettings {
  const org = contract?.organizations || {};
  const features = org.features && typeof org.features === 'object' && !Array.isArray(org.features)
    ? org.features as Record<string, unknown>
    : {};
  const email = stringSetting(features.school_contract_signing_email) || stringSetting(org.email);
  return {
    email,
    reason: stringSetting(features.school_contract_signature_reason) || 'Ugdymo sutarties pasirašymas',
    location: stringSetting(features.school_contract_signature_location),
    contact: stringSetting(features.school_contract_signature_contact) || email,
  };
}

export function contractPdfFileName(contract: any): string {
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

/** Canonical storage path of a signer's resulting PDF (one per contract+role). */
export function signedPdfPathForRole(organizationId: string, contractId: string, role: SignerRole): string {
  return `${organizationId}/contracts/${contractId}/signed/${role}.pdf`;
}

/** Store a signer's resulting PDF; overwrites per (contract, role). */
export async function uploadSignedPdf(
  supabase: SupabaseClient,
  params: { organizationId: string; contractId: string; role: SignerRole; bytes: Buffer },
): Promise<string> {
  const path = signedPdfPathForRole(params.organizationId, params.contractId, params.role);
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

async function createContractSignedUrl(
  supabase: SupabaseClient,
  path: string,
  downloadName?: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(SCHOOL_CONTRACTS_BUCKET)
    .createSignedUrl(extractSchoolContractStoragePath(path), SIGNATURE_TOKEN_TTL_MS / 1000, {
      // Stored per-role objects are named school.pdf / parent_primary.pdf — force
      // a human filename so parents don't end up signing a doc called "school".
      download: downloadName || undefined,
    });
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function fetchSignatureRows(supabase: SupabaseClient, contractId: string): Promise<any[]> {
  const { data } = await supabase
    .from('school_contract_signatures')
    .select('*')
    .eq('contract_id', contractId);
  return data || [];
}

/**
 * First parent role still requiring a signature (order: primary, then the
 * optional second parent — mirroring advanceAfterRoleSigned); null when none.
 */
export function pendingParentRole(contract: any, rows: any[]): SignerRole | null {
  const st = contract?.student || {};
  const primarySigned = rows.find((r) => r.role === 'parent_primary')?.status === 'signed';
  if (!primarySigned) return 'parent_primary';
  const needSecond =
    Boolean(contract?.require_second_parent) && Boolean(String(st.parent_secondary_email || '').trim());
  if (needSecond && rows.find((r) => r.role === 'parent_secondary')?.status !== 'signed') return 'parent_secondary';
  return null;
}

/** Resolve the input PDF a signer must sign (the previous signer's output). */
export function inputPdfPathForRole(contract: any, rows: any[], role: SignerRole): string {
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
  const settings = contractSigningSettings(contract);
  const responseUrl = `${appOrigin.replace(/\/$/, '')}/pasirasymas/sutarties/per/go-sign/${encodeURIComponent(row.token)}/rezultatas`;

  // The signature annotation (reason/location/contact) is stamped onto the PDF
  // per signer. The org-level location/contact describe the SCHOOL — parents
  // sign from wherever they are and must show their own contact, not info@.
  const isSchoolSigner = row.role === 'school';
  const result = await initOneSign({
    responseUrl,
    signingType: 'Signature',
    locale: 'lt',
    position: signaturePositionForRole(row.role as SignerRole),
    signerPersonalCode: row.signer_personal_code || undefined,
    reason: settings.reason || undefined,
    location: isSchoolSigner ? (settings.location || undefined) : undefined,
    contact: isSchoolSigner ? (settings.contact || undefined) : (stringSetting(row.signer_email) || undefined),
    displayValidity: true,
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
      // The school signs from an authenticated admin page and may take longer
      // than the parent-link TTL. Parent links remain time-limited.
      token_expires_at:
        params.role === 'school' ? null : new Date(Date.now() + SIGNATURE_TOKEN_TTL_MS).toISOString(),
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
  to: string | string[],
  data: Record<string, unknown>,
): Promise<boolean> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);
  if (!serviceKey || recipients.length === 0) return false;
  try {
    const response = await fetch(`${appOrigin.replace(/\/$/, '')}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-key': serviceKey },
      body: JSON.stringify({ type, to: recipients, data, locale: 'lt' }),
    });
    if (!response.ok) {
      console.error('[schoolContractSigning] email send failed:', type, response.status, await response.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (e) {
    console.error('[schoolContractSigning] email send failed:', (e as Error)?.message);
    return false;
  }
}

function parentSignUrl(appOrigin: string, token: string): string {
  return `${appOrigin.replace(/\/$/, '')}/pasirasymas/sutarties/per/go-sign/${encodeURIComponent(token)}`;
}

export interface ReturnResult {
  status: 'pending' | 'in_progress' | 'signed' | 'canceled' | 'expired' | 'not_found';
  role?: SignerRole;
  contractId?: string;
  contractStatus?: string;
  done?: boolean;
}

export interface PollAndAdvanceOptions {
  /** Browser return pages retry briefly; server reconciliation needs one cheap check per scheduled run. */
  attempts?: number;
  delayMs?: number;
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
  options: PollAndAdvanceOptions = {},
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
  const contractId = String((contract as any).id);

  if (row.status === 'signed') {
    const contractStatus = String((contract as any).signing_status || '');
    return {
      status: 'signed',
      role: row.role,
      contractId,
      contractStatus,
      done: contractStatus === 'signed',
    };
  }
  if (!row.gosign_transaction_id) {
    if (row.token_expires_at && new Date(row.token_expires_at).getTime() < Date.now()) {
      return { status: 'expired', role: row.role, contractId };
    }
    return { status: 'pending', role: row.role, contractId, contractStatus: (contract as any).signing_status };
  }

  const result = await pollSigningResult(row.gosign_transaction_id, {
    attempts: options.attempts ?? 6,
    delayMs: options.delayMs ?? 1500,
  });
  if (result.status === 'InProgress') return { status: 'in_progress', role: row.role, contractId };
  if (result.status === 'Canceled') {
    await supabase
      .from('school_contract_signatures')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
      .eq('id', row.id);
    return { status: 'canceled', role: row.role, contractId };
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
  const { data: claimedRows, error: claimError } = await supabase
    .from('school_contract_signatures')
    .update({
      status: 'signed',
      signed_at: new Date().toISOString(),
      signed_pdf_path: signedPath,
      signer_certificate: result.signerCertificate ?? null,
      signer_certificate_trusted: result.signerCertificateTrusted ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('status', row.status)
    .select('id');
  if (claimError) throw new Error(`Could not record signed contract: ${claimError.message}`);
  if (!claimedRows || claimedRows.length === 0) {
    return {
      status: 'signed',
      role: row.role,
      contractId,
      contractStatus: String((contract as any).signing_status || ''),
      done: String((contract as any).signing_status || '') === 'signed',
    };
  }

  const adv = await advanceAfterRoleSigned(supabase, contract, row.role as SignerRole, signedPath, appOrigin);
  return {
    status: 'signed',
    role: row.role,
    contractId,
    contractStatus: adv.contractStatus,
    done: adv.done || undefined,
  };
}

/**
 * Side effects after a role's signature PDF is persisted: advance the contract,
 * invite the next signer, or finalize. Shared by the GoSign poll path and the
 * Smart-ID (Dokobit) upload path — both produce the same evolving PAdES PDF.
 */
export async function advanceAfterRoleSigned(
  supabase: SupabaseClient,
  contract: any,
  role: SignerRole,
  signedPath: string,
  appOrigin: string,
): Promise<{ contractStatus: string; done: boolean }> {
  const contractId = String((contract as any).id);
  const st = (contract as any).student || {};
  const settings = contractSigningSettings(contract);

  if (role === 'school') {
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
      signerPersonalCode: st.payer_personal_code,
    });
    const schoolSignedPdfUrl = await createContractSignedUrl(supabase, signedPath, contractPdfFileName(contract));
    await sendInternalEmail(appOrigin, 'school_contract_sign_request', String(st.payer_email || ''), {
      parentName: st.payer_name || '',
      studentName: st.full_name || '',
      schoolName: (contract as any).organizations?.name || '',
      schoolEmail: settings.email,
      signUrl: parentSignUrl(appOrigin, parentRow.token),
      pdfUrl: schoolSignedPdfUrl || undefined,
      organizationId: (contract as any).organization_id,
    });
    return { contractStatus: 'signed_by_school', done: false };
  }

  if (role === 'parent_primary') {
    const needSecond =
      Boolean((contract as any).require_second_parent) && Boolean(String(st.parent_secondary_email || '').trim());
    if (needSecond) {
      const p2 = await ensureSignatureRow(supabase, {
        contractId,
        role: 'parent_secondary',
        signerName: st.parent_secondary_name,
        signerEmail: st.parent_secondary_email,
        signerPersonalCode: st.parent_secondary_personal_code,
      });
      const primarySignedPdfUrl = await createContractSignedUrl(supabase, signedPath, contractPdfFileName(contract));
      await sendInternalEmail(appOrigin, 'school_contract_sign_request', String(st.parent_secondary_email || ''), {
        parentName: st.parent_secondary_name || '',
        studentName: st.full_name || '',
        schoolName: (contract as any).organizations?.name || '',
        schoolEmail: settings.email,
        signUrl: parentSignUrl(appOrigin, p2.token),
        pdfUrl: primarySignedPdfUrl || undefined,
        organizationId: (contract as any).organization_id,
      });
      return { contractStatus: 'signed_by_school', done: false };
    }
    await finalizeContract(supabase, contract, signedPath, appOrigin);
    return { contractStatus: 'signed', done: true };
  }

  // parent_secondary
  await finalizeContract(supabase, contract, signedPath, appOrigin);
  return { contractStatus: 'signed', done: true };
}

async function sendFirstPendingInstallmentEmail(
  supabase: SupabaseClient,
  contract: any,
  appOrigin: string,
): Promise<void> {
  const st = contract.student || {};
  const recipient = stringSetting(st.payer_email);
  if (!recipient) return;
  const { data: installments, error } = await supabase
    .from('school_payment_installments')
    .select('id, installment_number, amount, due_date, payment_status')
    .eq('contract_id', contract.id)
    .order('installment_number', { ascending: true });
  if (error || !installments || installments.length === 0) return;
  const pending = installments.find((item: any) => item.payment_status !== 'paid') || installments[0];
  const settings = contractSigningSettings(contract);
  await sendInternalEmail(appOrigin, 'school_installment_request', recipient, {
    schoolName: contract.organizations?.name || '',
    schoolEmail: settings.email,
    contactEmail: settings.email,
    studentName: st.full_name || '',
    parentName: st.payer_name || st.full_name || '',
    recipientName: st.payer_name || st.full_name || '',
    installmentNumber: pending.installment_number,
    totalInstallments: installments.length,
    amount: Number(pending.amount || 0).toFixed(2),
    dueDate: pending.due_date ? new Date(pending.due_date).toLocaleDateString('lt-LT') : '—',
    additionalFeeAmount: Number(contract.additional_fee_amount || 0) > 0
      ? Number(contract.additional_fee_amount).toFixed(2)
      : undefined,
    additionalFeePurpose: contract.additional_fee_purpose || undefined,
    annualFee: Number(contract.annual_fee || 0).toFixed(2),
    installmentId: pending.id,
    organizationId: contract.organization_id,
  });
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
  const settings = contractSigningSettings(contract);
  const pdfUrl = await createContractSignedUrl(supabase, finalSignedPath, contractPdfFileName(contract));
  const contractsUrl = `${appOrigin.replace(/\/$/, '')}/school/contracts`;
  await Promise.all([
    sendInternalEmail(appOrigin, 'school_contract_fully_signed', String(st.payer_email || ''), {
      parentName: st.payer_name || '',
      studentName: st.full_name || '',
      schoolName: contract.organizations?.name || '',
      schoolEmail: settings.email,
      pdfUrl: pdfUrl || undefined,
      organizationId: contract.organization_id,
    }),
    sendInternalEmail(appOrigin, 'school_contract_parent_signed_admin', settings.email, {
      parentName: st.payer_name || '',
      studentName: st.full_name || '',
      schoolName: contract.organizations?.name || '',
      contractNumber: contract.contract_number || '',
      contractsUrl,
      pdfUrl: pdfUrl || undefined,
      organizationId: contract.organization_id,
    }),
  ]);
  await sendFirstPendingInstallmentEmail(supabase, contract, appOrigin);
}
