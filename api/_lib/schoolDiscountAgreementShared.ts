import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SCHOOL_CONTRACTS_BUCKET } from './schoolContractPdfPath.js';
import { extractSchoolContractStoragePath } from './schoolContractPdfPath.js';
import { ensureExtraLessonsCompletionToken } from './extraLessonsCompletionToken.js';
import { discountAgreementNote } from '../../src/lib/schoolMonthlyInvoiceDiscounts.js';

export const SCHOOL_DISCOUNT_ACCEPTANCE_VERSION = '2026-09-28-v2';

export function newSchoolDiscountToken(): string {
  return randomBytes(32).toString('hex');
}

export function schoolDiscountTokenHash(token: string): string {
  return createHash('sha256').update(String(token || ''), 'utf8').digest('hex');
}

export function newSchoolDiscountAgreementNumber(at = new Date()): string {
  const date = at.toISOString().slice(0, 10).replace(/-/g, '');
  return `NPR-${date}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

export function schoolDiscountAcceptUrl(origin: string, token: string): string {
  const base = String(origin || '').replace(/\/$/, '');
  return `${base}/school-discount-accept?token=${encodeURIComponent(token)}`;
}

export function schoolDiscountPdfPath(params: {
  organizationId: string;
  contractId: string;
  agreementNumber: string;
  draft?: boolean;
  acceptanceId?: string;
}): string {
  const safeNumber = params.agreementNumber.replace(/[^A-Za-z0-9_-]+/g, '-');
  const suffix = params.draft ? '-pasiulymas'
    : params.acceptanceId ? `-${params.acceptanceId.replace(/[^A-Za-z0-9_-]+/g, '')}` : '';
  return `${params.organizationId}/contracts/${params.contractId}/priedai/Nuolaidos-priedas-${safeNumber}${suffix}.pdf`;
}

export function isSchoolDiscountContractEligible(contract: any): boolean {
  return contract?.kind === 'extra_lessons'
    && !contract.archived_at && !contract.terminated_at && !contract.withdrawal_requested_at
    && ((contract.signing_status === 'sent' && !contract.accepted_at)
      || (contract.signing_status === 'signed' && Boolean(contract.accepted_at)));
}

export async function schoolDiscountContractLinks(
  supabase: SupabaseClient,
  contract: any,
  origin: string,
  parentToken?: string,
) {
  const contractAccepted = contract.signing_status === 'signed' && Boolean(contract.accepted_at);
  const path = contractAccepted ? contract.signed_contract_url || contract.pdf_url : contract.pdf_url;
  const contractPdfUrl = await signSchoolDiscountPdf(supabase,
    path ? extractSchoolContractStoragePath(path) : null);
  if (!contractPdfUrl) throw new Error('Nepavyko atidaryti užsiėmimų sutarties PDF.');
  const token = !contractAccepted && isSchoolDiscountContractEligible(contract)
    ? parentToken || await ensureExtraLessonsCompletionToken(supabase, contract.id) : null;
  return {
    contractAccepted,
    contractAcceptUrl: token
      ? `${origin.replace(/\/$/, '')}/school-extra-lessons-accept?token=${encodeURIComponent(token)}` : null,
    contractPdfUrl,
  };
}

/** Proposal and approved evidence always use separate storage objects. */
export async function ensureSchoolDiscountProposalPdf(
  supabase: SupabaseClient,
  agreement: any,
  contract: any,
  student: any,
  org: any,
): Promise<{ pdfPath: string; pdfUrl: string }> {
  const pdfPath = schoolDiscountPdfPath({
    organizationId: agreement.organization_id,
    contractId: agreement.contract_id,
    agreementNumber: agreement.agreement_number,
    draft: true,
  });
  if (agreement.pdf_path === pdfPath) {
    const existingUrl = await signSchoolDiscountPdf(supabase, pdfPath);
    if (existingUrl) return { pdfPath, pdfUrl: existingUrl };
  }
  const [{ generateSchoolDiscountAgreementPdf }, { resolveInvoiceBranding }, { data: profile, error: profileError }] = await Promise.all([
    import('./schoolDiscountAgreementPdf.js'),
    import('./invoiceBranding.js'),
    supabase.from('invoice_profiles')
      .select('business_name, company_code, address, contact_email')
      .eq('organization_id', agreement.organization_id).maybeSingle(),
  ]);
  if (profileError) throw profileError;
  const pdf = await generateSchoolDiscountAgreementPdf({
    agreementNumber: agreement.agreement_number,
    contractNumber: contract.contract_number || contract.id,
    issueDate: new Date(agreement.created_at || Date.now()).toLocaleDateString('lt-LT', { timeZone: 'Europe/Vilnius' }),
    acceptedAt: null,
    acceptanceStatement: null,
    contractAccepted: contract.signing_status === 'signed' && Boolean(contract.accepted_at),
    schoolName: profile?.business_name || org.name,
    schoolCompanyCode: profile?.company_code,
    schoolAddress: profile?.address,
    schoolEmail: profile?.contact_email || org.email,
    parentName: agreement.recipient_name || student.payer_name || student.full_name,
    parentEmail: agreement.recipient_email || student.payer_email || student.email,
    studentName: student.full_name,
    activityLabel: agreement.activity_label,
    discountType: agreement.discount_type,
    discountValue: Number(agreement.discount_value),
    validFrom: agreement.valid_from,
    validUntil: agreement.valid_until,
    note: agreement.note,
    branding: await resolveInvoiceBranding(supabase, agreement.organization_id),
  });
  const { error: uploadError } = await supabase.storage.from(SCHOOL_CONTRACTS_BUCKET)
    .upload(pdfPath, pdf, { contentType: 'application/pdf', upsert: true });
  if (uploadError) throw uploadError;
  const { data: saved, error: saveError } = await supabase.from('school_discount_agreements')
    .update({ pdf_path: pdfPath, updated_at: new Date().toISOString() })
    .eq('id', agreement.id).eq('status', 'pending').select('id').maybeSingle();
  if (saveError) throw saveError;
  if (!saved) throw new Error('Nuolaidos pasiūlymo būsena pasikeitė. Atidarykite nuorodą iš naujo.');
  agreement.pdf_path = pdfPath;
  const pdfUrl = await signSchoolDiscountPdf(supabase, pdfPath);
  if (!pdfUrl) throw new Error('Nepavyko atidaryti nuolaidos priedo PDF.');
  return { pdfPath, pdfUrl };
}

export async function loadSchoolDiscountAgreementByToken(
  supabase: SupabaseClient,
  token: string,
): Promise<any | null> {
  const hash = schoolDiscountTokenHash(token);
  const { data, error } = await supabase
    .from('school_discount_agreements')
    .select('*')
    .eq('acceptance_token_hash', hash)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

/** Keeps recurring lesson discounts in sync for monthly invoice review. */
export async function syncStudentLessonDiscountFromAgreement(
  supabase: SupabaseClient,
  agreement: {
    id: string;
    organization_id: string;
    student_id: string;
    subject_id?: string | null;
    tutor_id?: string | null;
    discount_type: string;
    discount_value: number | string;
    valid_from: string;
    valid_until: string;
    note?: string | null;
    agreement_number?: string | null;
  },
): Promise<void> {
  if (!agreement.subject_id) return;
  const discountType = agreement.discount_type === 'amount' ? 'amount' : 'percent';
  const value = Number(agreement.discount_value || 0);
  const { error } = await supabase.from('student_lesson_discounts').upsert({
    organization_id: agreement.organization_id,
    student_id: agreement.student_id,
    subject_id: agreement.subject_id,
    tutor_id: agreement.tutor_id || null,
    discount_type: discountType,
    percent: discountType === 'percent' ? value : null,
    amount_eur: discountType === 'amount' ? value : null,
    valid_from: agreement.valid_from,
    valid_until: agreement.valid_until,
    note: discountAgreementNote(agreement),
    agreement_id: agreement.id,
  }, { onConflict: 'agreement_id' });
  if (error) throw error;
}

export async function signSchoolDiscountPdf(
  supabase: SupabaseClient,
  path: string | null | undefined,
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(SCHOOL_CONTRACTS_BUCKET)
    .createSignedUrl(path, 60 * 30);
  return error ? null : data?.signedUrl || null;
}
