import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  renderStaffDocumentPdf,
  staffPersonalDetailsStoragePath,
  parseStoredStaffPersonalDetails,
  type ConsentAnswer,
} from './schoolStaffDocuments.js';
import { schoolContractPdfStoragePath, SCHOOL_CONTRACTS_BUCKET } from './schoolContractPdfPath.js';
import {
  notifyStaffConsentPdfFailure,
  type StaffConsentPdfFailureSource,
} from './staffConsentPdfFailureAlert.js';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadStashedStaffDetails(
  supabase: SupabaseClient,
  organizationId: string,
  confidentialityId: string,
): Promise<{ address: string; personalCode: string } | null> {
  const { data, error } = await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET)
    .download(staffPersonalDetailsStoragePath(organizationId, confidentialityId));
  if (error || !data) return null;
  try {
    const blob = data as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> };
    const raw = typeof blob.arrayBuffer === 'function'
      ? Buffer.from(await blob.arrayBuffer())
      : Buffer.from(String(data));
    return parseStoredStaffPersonalDetails(JSON.parse(raw.toString('utf8')));
  } catch {
    return null;
  }
}

export interface StaffConsentPdfContext {
  supabase: SupabaseClient;
  contract: {
    id: string;
    organization_id: string;
    contract_number: string;
    counterparty_name?: string | null;
    staff_employment_contract_number?: string | null;
    staff_employment_contract_date?: string | null;
  };
  agreement: {
    id: string;
    organization_id: string;
    contract_number: string;
    counterparty_name?: string | null;
    pdf_url?: string | null;
  };
  answers: ConsentAnswer[];
  details: { address: string; personalCode: string } | null;
}

async function persistStaffAgreementPdfIfNeeded(
  ctx: StaffConsentPdfContext,
): Promise<StaffConsentPdfContext['agreement']> {
  const { supabase, contract, agreement, details } = ctx;
  if (agreement.pdf_url || !details) return agreement;

  let agreementPdf: Buffer;
  try {
    agreementPdf = await renderStaffDocumentPdf('confidentiality', {
      name: String(agreement.counterparty_name || ''),
      employmentContractNumber: String(contract.staff_employment_contract_number || ''),
      employmentContractDate: String(contract.staff_employment_contract_date || ''),
      date: new Date(),
      address: details.address,
      personalCode: details.personalCode,
    });
  } catch (error) {
    console.error('[school-staff-consent] agreement render failed', error instanceof Error ? error.name : 'unknown');
    throw new Error('Nepavyko paruošti susitarimo PDF.');
  }

  const agreementPath = schoolContractPdfStoragePath({
    organizationId: agreement.organization_id,
    contractId: agreement.id,
    contractNumber: agreement.contract_number,
  }).replace(/\.pdf$/i, `-${randomUUID()}.pdf`);
  let uploadedAgreement = false;
  try {
    const { error: uploadError } = await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET).upload(agreementPath, agreementPdf, {
      contentType: 'application/pdf', upsert: false,
    });
    if (uploadError) throw uploadError;
    uploadedAgreement = true;
    const { data: updated, error: updateError } = await supabase.from('school_contracts').update({
      pdf_url: agreementPath,
      signing_status: 'awaiting_school_signature',
    }).eq('id', agreement.id).eq('signing_status', 'draft').is('pdf_url', null)
      .is('staff_revoked_at', null).select('id').maybeSingle();
    if (updateError) throw updateError;
    if (!updated) throw new Error('Susitarimas jau pakeistas.');
    uploadedAgreement = false;
    await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET)
      .remove([staffPersonalDetailsStoragePath(agreement.organization_id, agreement.id)]);
    return { ...agreement, pdf_url: agreementPath };
  } catch (error) {
    console.error('[school-staff-consent] agreement save failed', error instanceof Error ? error.name : 'unknown');
    throw error;
  } finally {
    if (uploadedAgreement) await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET).remove([agreementPath]);
  }
}

async function persistStaffConsentPdfOnly(ctx: StaffConsentPdfContext): Promise<void> {
  const { supabase, contract, answers } = ctx;
  let consentPdf: Buffer;
  try {
    consentPdf = await renderStaffDocumentPdf('consent', {
      name: String(contract.counterparty_name || ''),
      employmentContractNumber: String(contract.staff_employment_contract_number || ''),
      employmentContractDate: String(contract.staff_employment_contract_date || ''),
      date: new Date(),
    }, answers);
  } catch (error) {
    console.error('[school-staff-consent] consent render failed', error instanceof Error ? error.name : 'unknown');
    throw new Error('Nepavyko paruošti sutikimo PDF.');
  }

  const consentPath = schoolContractPdfStoragePath({
    organizationId: contract.organization_id,
    contractId: contract.id,
    contractNumber: contract.contract_number,
  }).replace(/\.pdf$/i, `-${randomUUID()}.pdf`);
  let uploadedConsent = false;
  try {
    const { error: uploadError } = await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET).upload(consentPath, consentPdf, {
      contentType: 'application/pdf', upsert: false,
    });
    if (uploadError) throw uploadError;
    uploadedConsent = true;
    const { data: updated, error: updateError } = await supabase.from('school_contracts').update({
      pdf_url: consentPath,
      signing_status: 'awaiting_school_signature',
    }).eq('id', contract.id).eq('signing_status', 'draft').not('staff_consent_answers', 'is', null)
      .is('pdf_url', null).is('staff_revoked_at', null).select('id').maybeSingle();
    if (updateError) throw updateError;
    if (!updated) throw new Error('Dokumentas jau pakeistas.');
    uploadedConsent = false;
  } catch (error) {
    console.error('[school-staff-consent] consent save failed', error instanceof Error ? error.name : 'unknown');
    throw error;
  } finally {
    if (uploadedConsent) await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET).remove([consentPath]);
  }
}

/** Agreement PDF is persisted before consent so a timeout can resume with only the consent step. */
export async function persistStaffConsentPdfs(ctx: StaffConsentPdfContext): Promise<void> {
  const agreement = await persistStaffAgreementPdfIfNeeded(ctx);
  await persistStaffConsentPdfOnly({ ...ctx, agreement });
}

export async function persistStaffConsentPdfsWithRetry(ctx: StaffConsentPdfContext, attempts = 3): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await persistStaffConsentPdfs(ctx);
      return;
    } catch (error) {
      if (attempt === attempts - 1) throw error;
      await sleep(4000 * (attempt + 1));
    }
  }
}

export async function completeStaffConsentPdfGeneration(
  ctx: StaffConsentPdfContext & { schoolName: string; source: StaffConsentPdfFailureSource },
): Promise<boolean> {
  try {
    await persistStaffConsentPdfsWithRetry(ctx);
    return true;
  } catch (error) {
    console.error('[school-staff-consent] pdf generation failed after retries', error instanceof Error ? error.name : 'unknown');
    await notifyStaffConsentPdfFailure(ctx.supabase, {
      organizationId: ctx.contract.organization_id,
      consentId: ctx.contract.id,
      employeeName: String(ctx.contract.counterparty_name || ''),
      schoolName: ctx.schoolName,
      contractNumber: String(ctx.contract.contract_number || ''),
      source: ctx.source,
    });
    return false;
  }
}

export async function retryPendingStaffConsentPdfs(supabase: SupabaseClient, limit = 5): Promise<{ attempted: number; completed: number }> {
  const { data: pending, error } = await supabase.from('school_contracts')
    .select('id, organization_id, contract_number, counterparty_name, staff_document_group_id, staff_consent_answers, staff_employment_contract_number, staff_employment_contract_date')
    .eq('staff_document_type', 'consent').not('staff_consent_answers', 'is', null).is('pdf_url', null)
    .eq('signing_status', 'draft').is('staff_revoked_at', null).limit(limit);
  if (error || !pending?.length) return { attempted: 0, completed: 0 };
  let completed = 0;
  for (const contract of pending) {
    const { data: agreement } = await supabase.from('school_contracts')
      .select('id, organization_id, contract_number, counterparty_name, pdf_url')
      .eq('organization_id', contract.organization_id)
      .eq('staff_document_group_id', contract.staff_document_group_id)
      .eq('staff_document_type', 'confidentiality').maybeSingle();
    if (!agreement) continue;
    const details = agreement.pdf_url
      ? null
      : await loadStashedStaffDetails(supabase, agreement.organization_id, agreement.id);
    if (!agreement.pdf_url && !details) continue;
    const { data: org } = await supabase.from('organizations').select('name').eq('id', contract.organization_id).maybeSingle();
    const ok = await completeStaffConsentPdfGeneration({
      supabase,
      contract,
      agreement,
      answers: contract.staff_consent_answers as ConsentAnswer[],
      details,
      schoolName: String(org?.name || 'Mokykla'),
      source: 'cron_retry',
    });
    if (ok) completed += 1;
  }
  return { attempted: pending.length, completed };
}
